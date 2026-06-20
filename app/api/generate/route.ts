import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHookSnippet } from "@/lib/partners/musixmatch";
import {
  generateBrief,
  localizeBriefCopy,
  briefRowCopy,
  FORMAT_KEYS,
  type BriefCopy,
  type BriefInput,
} from "@/lib/generation/brief";
import { classifyGatewayError } from "@/lib/ai";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GENERATE: turn one opportunity into persisted multiformat briefs.
 *
 * Body: `{ opportunityId }`. Loads the opportunity + its track, derived
 * intelligence and the artist's agent config, fetches a LIVE display-only hook
 * snippet (never stored), generates the brief, localizes it into the
 * opportunity's market language, and replaces the opportunity's brief rows
 * (one per format × language). Marks the opportunity `in_progress`.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let opportunityId: string | undefined;
  try {
    const raw = await request.json();
    if (raw && typeof raw === "object") {
      opportunityId = (raw as { opportunityId?: string }).opportunityId;
    }
  } catch {
    // fall through to validation below
  }
  if (!opportunityId) {
    return NextResponse.json(
      { error: "opportunityId is required" },
      { status: 400 },
    );
  }

  // RLS scopes this to the signed-in user's own catalog.
  const { data: opp, error: oppErr } = await supabase
    .from("content_opportunities")
    .select(
      "id, artist_id, track_id, market, language, reason, tracks(id, title, isrc, mxm_track_id, track_intelligence(themes, mood, language, bpm, clip_start_ms, clip_end_ms, visual_mood))",
    )
    .eq("id", opportunityId)
    .single();
  if (oppErr || !opp || !opp.tracks) {
    return NextResponse.json(
      { error: "Opportunity or track not found" },
      { status: 404 },
    );
  }

  const track = opp.tracks;
  const intel = track.track_intelligence;

  const { data: config } = await supabase
    .from("agent_config")
    .select("brand_voice")
    .eq("artist_id", opp.artist_id)
    .maybeSingle();

  // Live, display-only hook for inspiration — fetched, used in-flight, never stored.
  let hookSnippet: string | null = null;
  if (track.mxm_track_id) {
    try {
      hookSnippet = await getHookSnippet(track.mxm_track_id);
    } catch {
      hookSnippet = null;
    }
  }

  const input: BriefInput = {
    track: { title: track.title, isrc: track.isrc },
    intelligence: {
      themes: intel?.themes ?? [],
      mood: intel?.mood ?? null,
      language: intel?.language ?? null,
      bpm: intel?.bpm ?? null,
      clipStartMs: intel?.clip_start_ms ?? null,
      clipEndMs: intel?.clip_end_ms ?? null,
      visualMood: intel?.visual_mood ?? null,
    },
    opportunity: {
      market: opp.market ?? "—",
      language: opp.language,
      reason: opp.reason ?? "",
    },
    brandVoice: config?.brand_voice ?? null,
    hookSnippet,
  };

  let brief: BriefCopy;
  try {
    brief = await generateBrief(input);
  } catch (err) {
    const { status, message } = classifyGatewayError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const srcLang = intel?.language ?? "en";
  const tgtLang =
    opp.language && opp.language !== srcLang ? opp.language : null;

  const variants: { lang: string; copy: BriefCopy }[] = [
    { lang: srcLang, copy: brief },
  ];
  if (tgtLang) {
    variants.push({
      lang: tgtLang,
      copy: await localizeBriefCopy(brief, tgtLang),
    });
  }

  const rows = variants.flatMap(({ lang, copy }) =>
    FORMAT_KEYS.map((format) => ({
      opportunity_id: opportunityId!,
      format,
      angle: copy.angle,
      market: opp.market,
      language: lang,
      copy: briefRowCopy(copy, format) as unknown as Json,
    })),
  );

  // Replace prior briefs for this opportunity so re-generation is idempotent.
  await supabase.from("briefs").delete().eq("opportunity_id", opportunityId);

  const { data: inserted, error: insErr } = await supabase
    .from("briefs")
    .insert(rows)
    .select("id, format, angle, market, language, copy, created_at");
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  await supabase
    .from("content_opportunities")
    .update({ status: "in_progress" })
    .eq("id", opportunityId);

  return NextResponse.json({ data: inserted });
}
