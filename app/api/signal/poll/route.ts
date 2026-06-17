import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getTrackStats } from "@/lib/partners/songstats";
import { getEvents } from "@/lib/partners/jambase";
import { detectOpportunities } from "@/lib/signal/momentum";
import type { MomentumSignal, Thresholds } from "@/lib/domain/types";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_THRESHOLDS: Thresholds = { accelerationPct: 0.25 };

function thresholdsFrom(raw: Json | null): Thresholds {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const accel = (raw as Record<string, unknown>).accelerationPct;
    if (typeof accel === "number" && Number.isFinite(accel)) {
      return { accelerationPct: accel };
    }
  }
  return DEFAULT_THRESHOLDS;
}

/**
 * WATCH + DETECT tick for the agent loop. Bearer-gated for cron/n8n; runs with
 * the service client so it sweeps every artist's catalog regardless of RLS.
 * For each track it pulls fresh Songstats metrics, stores them as signals,
 * compares the two latest captures, and raises one opportunity per rising
 * (track, market) that isn't already open — logging each detection.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: tracks, error: tracksError } = await supabase
    .from("tracks")
    .select("id, isrc, artist_id");
  if (tracksError) {
    return NextResponse.json({ error: tracksError.message }, { status: 500 });
  }

  const { data: configs } = await supabase
    .from("agent_config")
    .select("artist_id, thresholds");
  const thresholdsByArtist = new Map<string, Thresholds>(
    (configs ?? []).map((c) => [c.artist_id, thresholdsFrom(c.thresholds)]),
  );

  // Skip re-raising opportunities that are already open. Momentum opps are keyed
  // per (track, market); event-driven opps (no track) per (artist, market).
  const { data: open } = await supabase
    .from("content_opportunities")
    .select("artist_id, track_id, market")
    .in("status", ["new", "in_progress"]);
  const openKeys = new Set(
    (open ?? [])
      .filter((o) => o.track_id)
      .map((o) => `${o.track_id}|${o.market}`),
  );
  const openEventKeys = new Set(
    (open ?? [])
      .filter((o) => !o.track_id)
      .map((o) => `${o.artist_id}|${o.market}`),
  );

  let polled = 0;
  let opportunities = 0;

  for (const track of tracks ?? []) {
    if (!track.isrc) continue;

    let fresh: MomentumSignal[];
    try {
      fresh = await getTrackStats(track.isrc);
    } catch (err) {
      await supabase.from("agent_log").insert({
        artist_id: track.artist_id,
        level: "error",
        phase: "WATCH",
        message: `Songstats poll failed for ${track.isrc}`,
        payload: { error: err instanceof Error ? err.message : String(err) },
      });
      continue;
    }
    polled++;

    if (fresh.length > 0) {
      await supabase.from("track_signals").upsert(
        fresh.map((s) => ({
          track_id: track.id,
          source: s.source ?? "songstats",
          metric: s.metric,
          value: s.value,
          market: s.market,
          captured_at: s.capturedAt,
        })),
        {
          onConflict: "track_id,source,metric,market,captured_at",
          ignoreDuplicates: true,
        },
      );
    }

    const { data: history } = await supabase
      .from("track_signals")
      .select("metric, value, market, captured_at")
      .eq("track_id", track.id)
      .order("captured_at", { ascending: true });

    const signals: MomentumSignal[] = (history ?? []).map((row) => ({
      trackId: track.id,
      metric: row.metric,
      value: row.value,
      market: row.market ?? "global",
      capturedAt: row.captured_at,
    }));

    const detected = detectOpportunities(
      signals,
      thresholdsByArtist.get(track.artist_id) ?? DEFAULT_THRESHOLDS,
    );

    for (const op of detected) {
      const key = `${track.id}|${op.market}`;
      if (openKeys.has(key)) continue;

      const { error: insError } = await supabase
        .from("content_opportunities")
        .insert({
          artist_id: track.artist_id,
          track_id: track.id,
          reason: op.reason,
          market: op.market,
          language: op.language ?? null,
          status: "new",
          signal_delta: op.signalDelta as unknown as Json,
        });
      if (insError) continue;

      openKeys.add(key);
      opportunities++;

      await supabase.from("agent_log").insert({
        artist_id: track.artist_id,
        level: "info",
        phase: "DETECT",
        message: op.reason,
        payload: op.signalDelta as unknown as Json,
      });
    }
  }

  // Event-driven triggers: an upcoming show in a market is its own reason to
  // publish, independent of streaming momentum. One opportunity per
  // (artist, market) with a future show that isn't already being worked.
  const { data: artists } = await supabase.from("artists").select("id, name");

  let events = 0;
  let eventOpportunities = 0;

  for (const artist of artists ?? []) {
    if (!artist.name) continue;

    let upcoming;
    try {
      upcoming = await getEvents(artist.name);
    } catch (err) {
      await supabase.from("agent_log").insert({
        artist_id: artist.id,
        level: "error",
        phase: "WATCH",
        message: `JamBase poll failed for ${artist.name}`,
        payload: { error: err instanceof Error ? err.message : String(err) },
      });
      continue;
    }
    events += upcoming.length;

    for (const ev of upcoming) {
      if (!ev.market) continue;
      const key = `${artist.id}|${ev.market}`;
      if (openEventKeys.has(key)) continue;

      const where = ev.venue
        ? `${ev.venue}, ${ev.market}`
        : ev.city
          ? `${ev.city}, ${ev.market}`
          : ev.market;
      const reason = `Upcoming show: ${ev.name} — ${where} (${ev.date.slice(0, 10)})`;

      const { error: insError } = await supabase
        .from("content_opportunities")
        .insert({
          artist_id: artist.id,
          track_id: null,
          reason,
          market: ev.market,
          status: "new",
        });
      if (insError) continue;

      openEventKeys.add(key);
      eventOpportunities++;

      await supabase.from("agent_log").insert({
        artist_id: artist.id,
        level: "info",
        phase: "DETECT",
        message: reason,
        payload: {
          source: "jambase",
          event: ev.name,
          venue: ev.venue,
          city: ev.city,
          market: ev.market,
          date: ev.date,
        } as unknown as Json,
      });
    }
  }

  return NextResponse.json({
    data: { polled, opportunities, events, eventOpportunities },
  });
}
