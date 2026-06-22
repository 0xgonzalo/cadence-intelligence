import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getHookSnippet } from "@/lib/partners/musixmatch";
import { getTrackAudienceMarkets } from "@/lib/partners/songstats";
import { performanceMetricLabel } from "@/lib/signal/metric-label";
import { AnalyzeButton } from "@/components/catalog/AnalyzeButton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EnergyCurve } from "@/components/catalog/EnergyCurve";
import { ClipMap } from "@/components/catalog/ClipMap";

export const dynamic = "force-dynamic";

function toCurve(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(Number).filter(Number.isFinite);
}

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export default async function TrackIntelligencePage({
  params,
}: {
  params: Promise<{ trackId: string }>;
}) {
  const { trackId } = await params;
  const supabase = await createClient();

  const { data: track } = await supabase
    .from("tracks")
    .select(
      "id, title, isrc, mxm_track_id, track_intelligence(themes, mood, language, bpm, energy_curve, clip_start_ms, clip_end_ms, visual_mood)",
    )
    .eq("id", trackId)
    .single();

  if (!track) notFound();

  const intel = (track.track_intelligence as
    | {
        themes: string[] | null;
        mood: string | null;
        language: string | null;
        bpm: number | null;
        energy_curve: unknown;
        clip_start_ms: number | null;
        clip_end_ms: number | null;
        visual_mood: string | null;
      }
    | null) ?? null;

  const { data: signalRows } = await supabase
    .from("track_signals")
    .select("metric, value, market, captured_at")
    .eq("track_id", trackId)
    .order("captured_at", { ascending: false })
    .limit(40);

  // Latest reading per metric for the performance panel.
  const latestByMetric = new Map<string, { value: number; market: string | null }>();
  for (const row of signalRows ?? []) {
    if (!latestByMetric.has(row.metric)) {
      latestByMetric.set(row.metric, { value: row.value, market: row.market });
    }
  }
  // Real top-listener countries are fetched LIVE — momentum signals are all
  // market="global", so they can't drive the localization gap on their own.
  let markets: string[] = [];
  if (track.isrc) {
    try {
      markets = (await getTrackAudienceMarkets(track.isrc))
        .slice(0, 8)
        .map((m) => m.market);
    } catch {
      markets = [];
    }
  }

  const curve = toCurve(intel?.energy_curve);
  const durationMs = curve.length > 0 ? curve.length * 1000 : 0;

  // Hook snippet is fetched LIVE for display only — never persisted. The
  // adapter already enforces the <15-word compliance guard.
  let hookSnippet: string | null = null;
  if (track.mxm_track_id) {
    try {
      hookSnippet = await getHookSnippet(track.mxm_track_id);
    } catch {
      hookSnippet = null;
    }
  }

  const title = track.title ?? track.isrc ?? "Untitled track";
  const synced = Boolean(track.mxm_track_id);

  return (
    <div className="space-y-8">
      <div className="border-b border-border pb-6">
        <div className="flex items-start justify-between gap-4">
          <Link
            href="/catalog"
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Catalog
          </Link>
          <AnalyzeButton trackId={track.id} analyzed={Boolean(intel)} />
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {intel?.mood ? <Badge variant="solid">{intel.mood}</Badge> : null}
          {intel?.language ? (
            <Badge variant="outline">{intel.language}</Badge>
          ) : null}
          {intel?.bpm ? (
            <Badge variant="default">{Math.round(intel.bpm)} BPM</Badge>
          ) : null}
          {(intel?.themes ?? []).map((t) => (
            <Badge key={t} variant="default">
              {t}
            </Badge>
          ))}
          {!intel ? (
            <Badge variant="outline">
              Unanalyzed — run the intelligence pass
            </Badge>
          ) : null}
        </div>
        {hookSnippet ? (
          <p className="mt-4 max-w-prose border-l-2 border-foreground/30 pl-3 text-sm italic text-foreground/80">
            “{hookSnippet}”
            <span className="ml-2 not-italic font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              live hook
            </span>
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
            Energy curve
          </p>
          <div className="mt-4">
            <EnergyCurve curve={curve} />
          </div>
          <div className="mt-5">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
              Clip window
            </p>
            <ClipMap
              durationMs={durationMs}
              startMs={intel?.clip_start_ms ?? null}
              endMs={intel?.clip_end_ms ?? null}
            />
          </div>
        </Card>

        <Card className="p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
            Performance
          </p>
          {latestByMetric.size === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No signals captured yet.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {[...latestByMetric.entries()].slice(0, 6).map(([metric, m]) => (
                <li
                  key={metric}
                  className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2 last:border-0"
                >
                  <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    {performanceMetricLabel(metric)}
                    {m.market && m.market !== "global" ? ` · ${m.market}` : ""}
                  </span>
                  <span className="font-mono text-sm tabular-nums">
                    {fmtNum(m.value)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
            Localization gap
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Track language{" "}
            <span className="text-foreground">
              {intel?.language ?? "unknown"}
            </span>{" "}
            vs. audience markets
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {markets.length > 0 ? (
              markets.map((m) => (
                <Badge key={m} variant="outline">
                  {m}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">
                No audience data yet.
              </span>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
            Lyric-asset health
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-muted-foreground">Matched on Musixmatch</span>
              <Badge variant={synced ? "solid" : "outline"}>
                {synced ? "Yes" : "No"}
              </Badge>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-muted-foreground">Synced lyrics</span>
              <Badge variant="outline">Resolved live</Badge>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-muted-foreground">Translations</span>
              <Badge variant="outline">Resolved live</Badge>
            </li>
          </ul>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Lyric content is never stored — synced/translated state is fetched
            on demand.
          </p>
        </Card>
      </div>
    </div>
  );
}
