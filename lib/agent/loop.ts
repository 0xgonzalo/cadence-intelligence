import { z } from "zod";
import { createServiceClient, type DbClient } from "@/lib/supabase/server";
import { logAgent } from "@/lib/agent/log";
import {
  matchTrack,
  getAnalysis,
  getHookSnippet,
  getRichsync,
  type TrackAnalysis,
} from "@/lib/partners/musixmatch";
import { analyzeTrack } from "@/lib/partners/cyanite";
import { pickClipWindow } from "@/lib/intelligence/clip";
import {
  generateBrief,
  localizeBriefCopy,
  briefRowCopy,
  FORMAT_KEYS,
  type BriefCopy,
  type BriefInput,
} from "@/lib/generation/brief";
import { tts, DEFAULT_VOICE_ID } from "@/lib/partners/elevenlabs";
import {
  getTikTokCreators,
  getTrackAudienceMarkets,
} from "@/lib/partners/songstats";
import { rankCreators, type CreatorCandidate } from "@/lib/collab/rank";
import { generateStructured } from "@/lib/ai";
import type { Json } from "@/lib/supabase/types";

const BUCKET = "packages";
/** Signed-URL lifetime — short, matching the ephemeral-asset policy. */
const SIGNED_URL_TTL = 60 * 60 * 12;
/** Top leads that get an LLM-drafted outreach DM. */
const OUTREACH_TOP_N = 3;

const VISUAL_MOOD: Record<string, string> = {
  happy: "warm / bright",
  uplifting: "warm / bright",
  sad: "cool / muted",
  energetic: "high-contrast / neon",
  calm: "soft / pastel",
  dark: "low-key / shadow",
  romantic: "golden / soft-focus",
};

function visualMoodFor(mood: string | null): string | null {
  if (!mood) return null;
  return VISUAL_MOOD[mood.toLowerCase()] ?? mood;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function isProduced(asset: Json): boolean {
  return (
    !!asset &&
    typeof asset === "object" &&
    !Array.isArray(asset) &&
    !("error" in asset) &&
    !("skipped" in asset)
  );
}

/** Upload bytes to the private `packages` bucket and mint a short-lived URL. */
async function storeAudio(
  service: DbClient,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<Json> {
  const { error: upErr } = await service.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (upErr) throw new Error(upErr.message);
  const { data, error: signErr } = await service.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (signErr || !data) {
    throw new Error(signErr?.message ?? "could not sign asset url");
  }
  return { path, url: data.signedUrl, bytes: bytes.byteLength, contentType };
}

const OutreachSchema = z.object({
  message: z.string().describe("A short, warm outreach DM under 60 words."),
});

async function draftOutreach(
  handle: string,
  ctx: { title: string; market: string | null; themes: string[]; angle: string | null },
): Promise<string | null> {
  try {
    const { message } = await generateStructured({
      schema: OutreachSchema,
      system:
        "You write concise, genuine creator-outreach DMs for a music marketing team. No hashtags, no emojis, no salesy clichés.",
      prompt: [
        `Draft a short DM inviting the TikTok creator ${handle} to collaborate on content for the track "${ctx.title}".`,
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

export interface RunResult {
  opportunityId: string;
  artistId: string;
  packageId: string | null;
  status: "ready" | "draft";
}

/**
 * The autonomous pipeline for ONE opportunity: ANALYZE → GENERATE → PACKAGE →
 * SURFACE. Runs with the service client (RLS-bypassing) so it works in a cron /
 * n8n context with no user session, logging each stage boundary to `agent_log`
 * to evidence autonomy. Reuses the same partner/lib units as the per-layer
 * routes; every external call is failure-tolerant so one flaky partner can't
 * abort the run. Compliance: the hook snippet and richsync lyrics are fetched
 * live and never persisted — only derived labels and timing windows are stored.
 */
export async function runOpportunity(opportunityId: string): Promise<RunResult> {
  const supabase = createServiceClient();

  const { data: opp, error: oppErr } = await supabase
    .from("content_opportunities")
    .select(
      "id, artist_id, track_id, market, language, reason, tracks(id, isrc, title, mxm_track_id, track_intelligence(themes, mood, language, bpm, energy_curve, clip_start_ms, clip_end_ms, visual_mood))",
    )
    .eq("id", opportunityId)
    .single();
  if (oppErr || !opp || !opp.tracks) {
    throw new Error("Opportunity or track not found");
  }

  const track = opp.tracks;
  const oppId = opp.id;
  const artistId = opp.artist_id;
  const existing = track.track_intelligence;
  const title = track.title ?? track.isrc ?? "this track";

  await logAgent(supabase, {
    artistId,
    phase: "WATCH",
    message: `Run started for "${title}" — ${opp.reason ?? "rising momentum"}`,
    payload: { opportunityId: oppId, market: opp.market },
  });

  // --- ANALYZE: live Musixmatch + Cyanite → derived intelligence ------------
  await logAgent(supabase, {
    artistId,
    phase: "ANALYZE",
    message: `Analyzing "${title}" (themes, mood, energy, clip window)`,
  });

  let mxmTrackId = track.mxm_track_id;
  // Tracks onboarded by name may have no ISRC yet. We recover it from track.get
  // below so the ISRC-keyed partners (Cyanite, Songstats) can run this pass.
  let isrc = track.isrc;
  let analysis: TrackAnalysis = {
    themes: [],
    mood: null,
    language: null,
    isrc: null,
  };
  try {
    if (!mxmTrackId && isrc) {
      mxmTrackId = await matchTrack({ isrc });
      if (mxmTrackId) {
        await supabase
          .from("tracks")
          .update({ mxm_track_id: mxmTrackId })
          .eq("id", track.id);
      }
    }
    if (mxmTrackId) analysis = await getAnalysis(mxmTrackId);
    if (!isrc && analysis.isrc) {
      isrc = analysis.isrc;
      await supabase.from("tracks").update({ isrc }).eq("id", track.id);
      await logAgent(supabase, {
        artistId,
        phase: "ANALYZE",
        message: `Backfilled ISRC ${isrc} for "${title}" — enables momentum signals`,
      });
    }
  } catch (e) {
    await logAgent(supabase, {
      artistId,
      level: "warn",
      phase: "ANALYZE",
      message: `Musixmatch analysis degraded: ${errMsg(e)}`,
    });
  }

  let bpm: number | null = null;
  let energyCurve: number[] = [];
  if (isrc) {
    try {
      const cyanite = await analyzeTrack(isrc);
      bpm = cyanite.bpm;
      energyCurve = cyanite.energyCurve;
    } catch {
      // Cyanite unavailable (no key / unindexed) — leave bpm/curve empty.
    }
  }

  const durationMs = energyCurve.length > 0 ? energyCurve.length * 1000 : 0;
  const clip =
    energyCurve.length > 0
      ? pickClipWindow(energyCurve, durationMs)
      : { startMs: null as number | null, endMs: null as number | null };

  // Merge fresh analysis with any pre-existing intel as a fallback.
  const themes = analysis.themes.length ? analysis.themes : existing?.themes ?? [];
  const mood = analysis.mood ?? existing?.mood ?? null;
  const language = analysis.language ?? existing?.language ?? null;
  const finalBpm = bpm ?? existing?.bpm ?? null;
  const clipStartMs = clip.startMs ?? existing?.clip_start_ms ?? null;
  const clipEndMs = clip.endMs ?? existing?.clip_end_ms ?? null;
  const visualMood = visualMoodFor(mood) ?? existing?.visual_mood ?? null;

  await supabase.from("track_intelligence").upsert(
    {
      track_id: track.id,
      themes,
      mood,
      language,
      bpm: finalBpm,
      energy_curve: (energyCurve.length
        ? energyCurve
        : (existing?.energy_curve ?? [])) as unknown as Json,
      clip_start_ms: clipStartMs,
      clip_end_ms: clipEndMs,
      visual_mood: visualMood,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "track_id" },
  );

  // --- GENERATE: multiformat briefs + localization -------------------------
  await logAgent(supabase, {
    artistId,
    phase: "GENERATE",
    message: "Generating multiformat briefs + localized copy",
  });

  // Live, display-only hook for inspiration — used in-flight, never stored.
  let hookSnippet: string | null = null;
  if (mxmTrackId) {
    try {
      hookSnippet = await getHookSnippet(mxmTrackId);
    } catch {
      hookSnippet = null;
    }
  }

  const { data: config } = await supabase
    .from("agent_config")
    .select("brand_voice")
    .eq("artist_id", artistId)
    .maybeSingle();

  const briefInput: BriefInput = {
    track: { title: track.title, isrc },
    intelligence: {
      themes,
      mood,
      language,
      bpm: finalBpm,
      clipStartMs,
      clipEndMs,
      visualMood,
    },
    opportunity: {
      market: opp.market ?? "—",
      language: opp.language,
      reason: opp.reason ?? "",
    },
    brandVoice: config?.brand_voice ?? null,
    hookSnippet,
  };

  const brief = await generateBrief(briefInput);

  const srcLang = language ?? "en";
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

  const briefRows = variants.flatMap(({ lang, copy }) =>
    FORMAT_KEYS.map((format) => ({
      opportunity_id: oppId,
      format,
      angle: copy.angle,
      market: opp.market,
      language: lang,
      copy: briefRowCopy(copy, format) as unknown as Json,
    })),
  );

  await supabase.from("briefs").delete().eq("opportunity_id", oppId);
  await supabase.from("briefs").insert(briefRows);
  await supabase
    .from("content_opportunities")
    .update({ status: "in_progress" })
    .eq("id", oppId);

  // --- PACKAGE: voiceover + live lyric-clip window (no source audio in the
  // autonomous run, so stems are skipped) ----------------------------------
  await logAgent(supabase, {
    artistId,
    phase: "PACKAGE",
    message: "Assembling content package (voiceover + lyric clip)",
  });

  const results: Record<string, Json> = {
    instrumental: { skipped: "autonomous run has no source audio for stems" },
  };

  try {
    const voText = brief.script.trim() || brief.hook.trim();
    if (voText) {
      const bytes = await tts(voText, DEFAULT_VOICE_ID, srcLang);
      const stored = await storeAudio(
        supabase,
        `${oppId}/voiceover-${srcLang}.mp3`,
        bytes,
        "audio/mpeg",
      );
      results.voiceover =
        stored && typeof stored === "object" && !Array.isArray(stored)
          ? { ...stored, language: srcLang }
          : stored;
    } else {
      results.voiceover = { skipped: "no brief copy to voice" };
    }
  } catch (e) {
    results.voiceover = { error: errMsg(e) };
  }

  try {
    if (!mxmTrackId) {
      results.lyricClip = { skipped: "track not matched to Musixmatch" };
    } else {
      const lines = await getRichsync(mxmTrackId);
      const startS =
        clipStartMs != null ? clipStartMs / 1000 : (lines[0]?.start ?? 0);
      const endS =
        clipEndMs != null ? clipEndMs / 1000 : (lines.at(-1)?.end ?? startS);
      // Count lines inside the window WITHOUT storing any lyric text.
      const lineCount = lines.filter(
        (l) => l.end >= startS && l.start <= endS,
      ).length;
      results.lyricClip = {
        source: "musixmatch-richsync",
        clipStartMs: clipStartMs ?? Math.round(startS * 1000),
        clipEndMs: clipEndMs ?? Math.round(endS * 1000),
        lineCount,
        note: "Timing only — lyric text fetched live and never persisted.",
      };
    }
  } catch (e) {
    results.lyricClip = { error: errMsg(e) };
  }

  const producedAny = Object.values(results).some(isProduced);
  const pkgStatus: "ready" | "draft" = producedAny ? "ready" : "draft";

  await supabase.from("content_packages").delete().eq("opportunity_id", oppId);
  const { data: pkg } = await supabase
    .from("content_packages")
    .insert({
      opportunity_id: oppId,
      status: pkgStatus,
      assets: results as Json,
    })
    .select("id")
    .single();

  // --- SURFACE: ranked collab leads + outreach -----------------------------
  await logAgent(supabase, {
    artistId,
    phase: "SURFACE",
    message: "Scanning for collab leads",
  });

  try {
    let artistMarkets: string[] = [];
    if (isrc) {
      try {
        artistMarkets = (await getTrackAudienceMarkets(isrc))
          .slice(0, 5)
          .map((m) => m.market);
      } catch {
        artistMarkets = [];
      }
    }
    if (artistMarkets.length === 0 && opp.market) artistMarkets = [opp.market];

    const baseFit = themes.length > 0 ? 0.65 : 0.45;
    let candidates: CreatorCandidate[] = [];
    if (isrc) {
      try {
        candidates = (await getTikTokCreators(isrc)).map((c) => ({
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
    const angle = brief.angle ?? null;
    const drafts = await Promise.all(
      ranked.map((lead, i) =>
        i < OUTREACH_TOP_N
          ? draftOutreach(lead.handle, {
              title,
              market: opp.market,
              themes,
              angle,
            })
          : Promise.resolve(null),
      ),
    );

    await supabase.from("collab_leads").delete().eq("opportunity_id", oppId);
    if (ranked.length > 0) {
      await supabase.from("collab_leads").insert(
        ranked.map((lead, i) => ({
          opportunity_id: oppId,
          handle: lead.handle,
          source: lead.source ?? null,
          market: lead.markets[0] ?? null,
          fit_score: Math.round(lead.score * 1000) / 1000,
          reach: lead.reach,
          rationale: lead.rationale ?? null,
          outreach_draft: drafts[i],
        })),
      );
    }
    await logAgent(supabase, {
      artistId,
      phase: "SURFACE",
      message: `Surfaced ${ranked.length} collab lead(s)`,
    });
  } catch (e) {
    await logAgent(supabase, {
      artistId,
      level: "warn",
      phase: "SURFACE",
      message: `Collab scan degraded: ${errMsg(e)}`,
    });
  }

  // --- finalize ------------------------------------------------------------
  if (producedAny) {
    await supabase
      .from("content_opportunities")
      .update({ status: "ready" })
      .eq("id", oppId);
  }

  await logAgent(supabase, {
    artistId,
    phase: "SURFACE",
    message: producedAny
      ? `Content package ready for "${title}"`
      : `Run finished for "${title}" (package draft — assets degraded)`,
    payload: { packageId: pkg?.id ?? null, status: pkgStatus },
  });

  return {
    opportunityId: oppId,
    artistId,
    packageId: pkg?.id ?? null,
    status: pkgStatus,
  };
}
