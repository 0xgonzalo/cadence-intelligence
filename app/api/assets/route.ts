import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { uploadAudio, requestSplit, pollSplit } from "@/lib/partners/lalal";
import { tts, DEFAULT_VOICE_ID } from "@/lib/partners/elevenlabs";
import { getRichsync } from "@/lib/partners/musixmatch";
import { fetchWithTimeout, assertSafeUrl } from "@/lib/http";
import { normalizeAudioUrl, isInOpportunityScope } from "@/lib/audio-url";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "packages";
/** Signed-URL lifetime — kept short to match the ephemeral-asset policy. */
const SIGNED_URL_TTL = 60 * 60 * 12;

type AssetType = "instrumental" | "acapella" | "voiceover" | "lyricClip";
const DEFAULT_ASSETS: AssetType[] = ["instrumental", "voiceover", "lyricClip"];
const ASSET_TYPES = new Set<AssetType>([
  "instrumental",
  "acapella",
  "voiceover",
  "lyricClip",
]);

type ServiceClient = ReturnType<typeof createServiceClient>;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function downloadBytes(url: string): Promise<Uint8Array> {
  const res = await fetchWithTimeout(url, {}, 30_000);
  if (!res.ok) {
    throw new Error(`download failed: ${res.status} ${res.statusText}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/** Upload bytes to the private `packages` bucket and mint a short-lived URL. */
async function storeAudio(
  service: ServiceClient,
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

interface BriefRow {
  language: string | null;
  copy: Json;
}

/** Prefer a source-language brief that carries a usable script for voiceover. */
function pickBrief(briefs: BriefRow[], srcLang: string | null): BriefRow | null {
  if (briefs.length === 0) return null;
  const withText = briefs.filter((b) => voiceoverText(b.copy));
  const pool = withText.length > 0 ? withText : briefs;
  return pool.find((b) => b.language === srcLang) ?? pool[0];
}

function voiceoverText(copy: Json): string {
  if (copy && typeof copy === "object" && !Array.isArray(copy)) {
    const c = copy as Record<string, unknown>;
    for (const key of ["script", "body", "hook"] as const) {
      const v = c[key];
      if (typeof v === "string" && v.trim()) return v;
    }
  }
  return "";
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

/**
 * ASSET: assemble a Content Package for one opportunity.
 *
 * Body: `{ opportunityId, audioUrl?, assets? }`. Orchestrates (each step
 * independent and failure-tolerant): LALAL stem separation (instrumental /
 * acapella) from `audioUrl`, an ElevenLabs voiceover of the generated brief
 * copy in its market language, and a Musixmatch **richsync** lyric-clip window
 * fetched LIVE — only the timing window is recorded, never the lyric text.
 * Audio is stored in the private `packages` bucket (ephemeral; see the cleanup
 * cron) and the produced refs are written to `content_packages.assets`.
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
  let audioUrl: string | undefined;
  let audioPath: string | undefined;
  let requested: AssetType[] = DEFAULT_ASSETS;
  try {
    const raw = await request.json();
    if (raw && typeof raw === "object") {
      const body = raw as {
        opportunityId?: string;
        audioUrl?: string;
        audioPath?: string;
        assets?: unknown;
      };
      opportunityId = body.opportunityId;
      audioUrl = body.audioUrl;
      audioPath = body.audioPath;
      if (Array.isArray(body.assets)) {
        const picked = body.assets.filter(
          (a): a is AssetType =>
            typeof a === "string" && ASSET_TYPES.has(a as AssetType),
        );
        if (picked.length > 0) requested = picked;
      }
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
  // Reject SSRF-prone audio URLs before any server-side fetch (https-only,
  // public hosts). safeFetch re-checks each redirect hop downstream.
  if (audioUrl) {
    audioUrl = normalizeAudioUrl(audioUrl);
    try {
      await assertSafeUrl(audioUrl);
    } catch (e) {
      return NextResponse.json(
        { error: `invalid audioUrl: ${errMsg(e)}` },
        { status: 400 },
      );
    }
  }

  // RLS scopes this to the signed-in user's own catalog.
  const { data: opp, error: oppErr } = await supabase
    .from("content_opportunities")
    .select(
      "id, market, language, tracks(id, mxm_track_id, track_intelligence(language, clip_start_ms, clip_end_ms)), briefs(language, copy)",
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
  const briefs = (opp.briefs ?? []) as BriefRow[];
  const service = createServiceClient();
  const results: Record<string, Json> = {};
  // Build storage paths from the DB-trusted id, never the raw request value.
  const oppId = opp.id;

  // --- stems (one LALAL split yields acapella + instrumental) --------------
  const wantInstrumental = requested.includes("instrumental");
  const wantAcapella = requested.includes("acapella");
  if (wantInstrumental || wantAcapella) {
    // Source the audio bytes from the uploaded object (preferred) or the URL.
    let source: Uint8Array | string | null = null;
    let sourceErr: string | null = null;
    if (audioPath) {
      if (!isInOpportunityScope(oppId, audioPath)) {
        sourceErr = "audioPath outside opportunity scope";
      } else {
        try {
          const { data, error } = await service.storage
            .from(BUCKET)
            .download(audioPath);
          if (error || !data) {
            throw new Error(error?.message ?? "source download failed");
          }
          source = new Uint8Array(await data.arrayBuffer());
        } catch (e) {
          sourceErr = errMsg(e);
        }
      }
    } else if (audioUrl) {
      source = audioUrl;
    }

    if (!source) {
      const note: Json = sourceErr
        ? { error: sourceErr }
        : { skipped: "no audio source provided" };
      if (wantInstrumental) results.instrumental = note;
      if (wantAcapella) results.acapella = note;
    } else {
      try {
        const fileId = await uploadAudio(source, `${track.id}.mp3`);
        await requestSplit(fileId, "vocals");
        const split = await pollSplit(fileId);
        if (wantInstrumental && split.backUrl) {
          const bytes = await downloadBytes(split.backUrl);
          results.instrumental = await storeAudio(
            service,
            `${oppId}/instrumental.wav`,
            bytes,
            "audio/wav",
          );
        }
        if (wantAcapella && split.stemUrl) {
          const bytes = await downloadBytes(split.stemUrl);
          results.acapella = await storeAudio(
            service,
            `${oppId}/acapella.wav`,
            bytes,
            "audio/wav",
          );
        }
      } catch (e) {
        const err: Json = { error: errMsg(e) };
        if (wantInstrumental && !results.instrumental) results.instrumental = err;
        if (wantAcapella && !results.acapella) results.acapella = err;
      }
    }
  }

  // --- voiceover (ElevenLabs TTS of the brief copy) ------------------------
  if (requested.includes("voiceover")) {
    try {
      const brief = pickBrief(briefs, intel?.language ?? null);
      const text = brief ? voiceoverText(brief.copy) : "";
      if (!text) {
        results.voiceover = { skipped: "no brief copy to voice" };
      } else {
        const lang = brief?.language ?? undefined;
        const bytes = await tts(text, DEFAULT_VOICE_ID, lang);
        const stored = await storeAudio(
          service,
          `${oppId}/voiceover-${lang ?? "src"}.mp3`,
          bytes,
          "audio/mpeg",
        );
        results.voiceover =
          stored && typeof stored === "object" && !Array.isArray(stored)
            ? { ...stored, language: lang ?? null }
            : stored;
      }
    } catch (e) {
      results.voiceover = { error: errMsg(e) };
    }
  }

  // --- lyric clip (LIVE richsync → timing window only; no text persisted) --
  if (requested.includes("lyricClip")) {
    try {
      if (!track.mxm_track_id) {
        results.lyricClip = { skipped: "track not matched to Musixmatch" };
      } else {
        const lines = await getRichsync(track.mxm_track_id);
        const startMs = intel?.clip_start_ms ?? null;
        const endMs = intel?.clip_end_ms ?? null;
        const startS = startMs != null ? startMs / 1000 : (lines[0]?.start ?? 0);
        const endS =
          endMs != null ? endMs / 1000 : (lines.at(-1)?.end ?? startS);
        // Count lines inside the window WITHOUT storing any lyric text.
        const lineCount = lines.filter(
          (l) => l.end >= startS && l.start <= endS,
        ).length;
        results.lyricClip = {
          source: "musixmatch-richsync",
          clipStartMs: startMs ?? Math.round(startS * 1000),
          clipEndMs: endMs ?? Math.round(endS * 1000),
          lineCount,
          note: "Timing only — lyric text fetched live and never persisted.",
        };
      }
    } catch (e) {
      results.lyricClip = { error: errMsg(e) };
    }
  }

  const producedAny = Object.values(results).some(isProduced);

  // One package per opportunity — replace on re-run (orphaned objects are
  // reaped by the cleanup cron).
  await supabase
    .from("content_packages")
    .delete()
    .eq("opportunity_id", oppId);

  const { data: pkg, error: insErr } = await supabase
    .from("content_packages")
    .insert({
      opportunity_id: oppId,
      status: producedAny ? "ready" : "draft",
      assets: results as Json,
    })
    .select("id, status, assets, created_at")
    .single();
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  if (producedAny) {
    await supabase
      .from("content_opportunities")
      .update({ status: "ready" })
      .eq("id", oppId);
  }

  return NextResponse.json({ data: pkg });
}
