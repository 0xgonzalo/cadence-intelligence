import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getAnalysis,
  getHookSnippet,
  matchTrack,
} from "@/lib/partners/musixmatch";
import { analyzeTrack } from "@/lib/partners/cyanite";
import { pickClipWindow } from "@/lib/intelligence/clip";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * ANALYZE: runs the live Musixmatch + Cyanite intelligence pass for one track
 * and upserts the DERIVED result to `track_intelligence`. The hook snippet is
 * fetched live for DISPLAY ONLY and returned in the response — never persisted.
 *
 * Optional JSON body: `{ cyaniteTrackId?, durationMs? }` to supply the Cyanite
 * library reference and true track duration when known (our schema stores
 * neither). Absent those, energy/clip degrade gracefully.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ trackId: string }> },
) {
  const { trackId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RLS scopes this select to the signed-in user's own catalog.
  const { data: track, error: trackError } = await supabase
    .from("tracks")
    .select("id, isrc, title, mxm_track_id")
    .eq("id", trackId)
    .single();
  if (trackError || !track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  let body: { cyaniteTrackId?: string; durationMs?: number } = {};
  try {
    const raw = await request.json();
    if (raw && typeof raw === "object") body = raw as typeof body;
  } catch {
    // No body — fine, use defaults.
  }

  // Resolve and persist the Musixmatch id (derived metadata, not lyrics).
  let mxmTrackId = track.mxm_track_id;
  try {
    if (!mxmTrackId && track.isrc) {
      mxmTrackId = await matchTrack({ isrc: track.isrc });
      if (mxmTrackId) {
        await supabase
          .from("tracks")
          .update({ mxm_track_id: mxmTrackId })
          .eq("id", track.id);
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Musixmatch match failed: ${msg(err)}` },
      { status: 502 },
    );
  }

  // Musixmatch derived analysis (themes / mood / language).
  let analysis = { themes: [] as string[], mood: null as string | null, language: null as string | null };
  if (mxmTrackId) {
    try {
      analysis = await getAnalysis(mxmTrackId);
    } catch (err) {
      return NextResponse.json(
        { error: `Musixmatch analysis failed: ${msg(err)}` },
        { status: 502 },
      );
    }
  }

  // Cyanite audio analysis (bpm + energy curve). Best-effort: needs a Cyanite
  // library reference, which our schema doesn't store — caller may pass one.
  let bpm: number | null = null;
  let energyCurve: number[] = [];
  const cyaniteRef = body.cyaniteTrackId ?? track.isrc;
  if (cyaniteRef) {
    try {
      const cyanite = await analyzeTrack(cyaniteRef);
      bpm = cyanite.bpm;
      energyCurve = cyanite.energyCurve;
    } catch {
      // Cyanite unavailable (no key / unindexed track) — leave bpm/curve empty.
    }
  }

  // Clip window over the energy curve. Fall back to a 1s/sample span when the
  // true duration isn't supplied.
  const durationMs =
    body.durationMs ?? (energyCurve.length > 0 ? energyCurve.length * 1000 : 0);
  const clip =
    energyCurve.length > 0
      ? pickClipWindow(energyCurve, durationMs)
      : { startMs: null as number | null, endMs: null as number | null };

  const visualMood = visualMoodFor(analysis.mood);

  const { error: upsertError } = await supabase
    .from("track_intelligence")
    .upsert(
      {
        track_id: track.id,
        themes: analysis.themes,
        mood: analysis.mood,
        language: analysis.language,
        bpm,
        energy_curve: energyCurve as unknown as Json,
        clip_start_ms: clip.startMs,
        clip_end_ms: clip.endMs,
        visual_mood: visualMood,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "track_id" },
    );
  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  // Live, display-only hook snippet — returned, NEVER written to the DB.
  let hookSnippet: string | null = null;
  if (mxmTrackId) {
    try {
      hookSnippet = await getHookSnippet(mxmTrackId);
    } catch {
      hookSnippet = null;
    }
  }

  return NextResponse.json({
    data: {
      trackId: track.id,
      intelligence: {
        themes: analysis.themes,
        mood: analysis.mood,
        language: analysis.language,
        bpm,
        energyCurve,
        clipStartMs: clip.startMs,
        clipEndMs: clip.endMs,
        visualMood,
      },
      hookSnippet,
    },
  });
}
