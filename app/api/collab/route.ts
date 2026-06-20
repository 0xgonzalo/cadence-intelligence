import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTikTokCreators, getTrackAudienceMarkets } from "@/lib/partners/songstats";
import { getAnalysis } from "@/lib/partners/musixmatch";
import { rankCreators, type CreatorCandidate } from "@/lib/collab/rank";
import { generateStructured } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

/** How many top leads get an LLM-drafted outreach message. */
const OUTREACH_TOP_N = 3;

/**
 * Known partner-stack gap (PRD): the available APIs surface real creator
 * handles only via Songstats TikTok UGC. Cyanite adjacency returns track ids
 * (no creators) and we persist no Cyanite library id, so deeper creator
 * discovery isn't wired. We never fabricate creators — the UI shows this note.
 */
const GAP_NOTE =
  "Creator discovery is limited to Songstats TikTok UGC leads. Cyanite adjacency returns tracks (not creators) and isn't wired to creator handles, so the pool reflects only real, verifiable UGC creators — none are fabricated.";

const OutreachSchema = z.object({
  message: z.string().describe("A short, warm outreach DM under 60 words."),
});

async function draftOutreach(
  lead: { handle: string; market: string | null },
  ctx: { title: string; market: string | null; themes: string[]; angle: string | null },
): Promise<string | null> {
  try {
    const { message } = await generateStructured({
      schema: OutreachSchema,
      system:
        "You write concise, genuine creator-outreach DMs for a music marketing team. No hashtags, no emojis, no salesy clichés.",
      prompt: [
        `Draft a short DM inviting the TikTok creator ${lead.handle} to collaborate on content for the track "${ctx.title}".`,
        ctx.market ? `Target market: ${ctx.market}.` : "",
        ctx.themes.length ? `Song themes: ${ctx.themes.slice(0, 4).join(", ")}.` : "",
        ctx.angle ? `Creative angle: ${ctx.angle}.` : "",
        "Reference why they're a fit and propose one concrete idea. Under 60 words.",
      ]
        .filter(Boolean)
        .join(" "),
    });
    return message.trim() || null;
  } catch {
    return null;
  }
}

/**
 * COLLAB: surface real, ranked creator leads for one opportunity.
 *
 * Body: `{ opportunityId }`. Builds a candidate pool from real partner data
 * (Songstats TikTok creators + the track's audience markets, Musixmatch themes
 * for values context), ranks via `rankCreators`, drafts outreach for the top
 * leads, and replaces this opportunity's `collab_leads`. No creators are
 * fabricated; see `GAP_NOTE` for the partner-stack limitation.
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
    // fall through to validation
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
      "id, market, language, tracks(id, isrc, title, mxm_track_id, track_intelligence(themes)), briefs(angle)",
    )
    .eq("id", opportunityId)
    .single();
  if (oppErr || !opp) {
    return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  }

  // Event-driven (live-show) opportunities have no catalog track. Creator
  // discovery is ISRC-driven (Songstats audience + TikTok UGC), so a track-less
  // signal yields no candidates — return a clean empty radar, not a 404.
  const track = opp.tracks;
  const oppId = opp.id;
  const title = track?.title ?? track?.isrc ?? "this track";
  const angle = opp.briefs?.find((b) => b.angle)?.angle ?? null;

  // --- real audience geography (Songstats) → the artist's priority markets ---
  let artistMarkets: string[] = [];
  if (track?.isrc) {
    try {
      artistMarkets = (await getTrackAudienceMarkets(track.isrc))
        .slice(0, 5)
        .map((m) => m.market);
    } catch {
      artistMarkets = [];
    }
  }
  if (artistMarkets.length === 0 && opp.market) artistMarkets = [opp.market];

  // --- derived themes (Musixmatch) for values context + rationale -----------
  let themes: string[] = track?.track_intelligence?.themes ?? [];
  if (themes.length === 0 && track?.mxm_track_id) {
    try {
      themes = (await getAnalysis(track.mxm_track_id)).themes ?? [];
    } catch {
      themes = [];
    }
  }

  // --- candidate pool: real TikTok UGC creators only (no fabrication) --------
  const baseFit = themes.length > 0 ? 0.65 : 0.45;
  let candidates: CreatorCandidate[] = [];
  if (track?.isrc) {
    try {
      candidates = (await getTikTokCreators(track.isrc)).map((c) => ({
        handle: c.handle,
        markets: c.market ? [c.market] : [],
        reach: c.reach ?? 0,
        fit: baseFit,
        source: "songstats-tiktok",
        rationale: [
          `Driving TikTok UGC for "${title}"`,
          c.market ? `in ${c.market}` : null,
          themes.length ? `· themes: ${themes.slice(0, 3).join(", ")}` : null,
        ]
          .filter(Boolean)
          .join(" "),
      }));
    } catch {
      candidates = [];
    }
  }

  const ranked = rankCreators(candidates, { artistMarkets });

  // --- outreach drafts for the top leads (best-effort, gateway-backed) -------
  const drafts = await Promise.all(
    ranked.map((lead, i) =>
      i < OUTREACH_TOP_N
        ? draftOutreach(
            { handle: lead.handle, market: lead.markets[0] ?? null },
            { title, market: opp.market, themes, angle },
          )
        : Promise.resolve(null),
    ),
  );

  // Replace prior leads so re-running is idempotent.
  await supabase.from("collab_leads").delete().eq("opportunity_id", oppId);

  let inserted: unknown[] = [];
  if (ranked.length > 0) {
    const rows = ranked.map((lead, i) => ({
      opportunity_id: oppId,
      handle: lead.handle,
      source: lead.source ?? null,
      market: lead.markets[0] ?? null,
      fit_score: Math.round(lead.score * 1000) / 1000,
      reach: lead.reach,
      rationale: lead.rationale ?? null,
      outreach_draft: drafts[i],
    }));
    const { data, error: insErr } = await supabase
      .from("collab_leads")
      .insert(rows)
      .select(
        "id, handle, source, market, fit_score, reach, rationale, outreach_draft, created_at",
      );
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    inserted = data ?? [];
  }

  return NextResponse.json({
    data: inserted,
    note: GAP_NOTE,
    artistMarkets,
  });
}
