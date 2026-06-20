import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  OpportunityCard,
  type RadarOpportunity,
} from "@/components/radar/OpportunityCard";
import { RefreshSignals } from "@/components/radar/RefreshSignals";

export const dynamic = "force-dynamic";

type DeltaShape = RadarOpportunity["delta"];

function parseDelta(raw: unknown): DeltaShape {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const from = Number(d.from);
  const to = Number(d.to);
  const pct = Number(d.pct);
  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(pct)) {
    return null;
  }
  return {
    metric: typeof d.metric === "string" ? d.metric : "signal",
    from,
    to,
    pct,
  };
}

export default async function RadarPage({
  searchParams,
}: {
  searchParams: Promise<{ artist?: string }>;
}) {
  const { artist } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("content_opportunities")
    .select(
      "id, reason, market, language, status, signal_delta, detected_at, tracks(title, isrc)",
    )
    .order("detected_at", { ascending: false });
  if (artist) query = query.eq("artist_id", artist);

  const { data, error } = await query;

  const artistName = artist
    ? (await supabase.from("artists").select("name").eq("id", artist).maybeSingle())
        .data?.name ?? null
    : null;

  const opportunities: RadarOpportunity[] = (data ?? []).map((row) => ({
    id: row.id,
    trackTitle: row.tracks?.title ?? row.tracks?.isrc ?? "Untitled track",
    reason: row.reason,
    market: row.market,
    language: row.language,
    status: row.status,
    delta: parseDelta(row.signal_delta),
    detectedAt: row.detected_at,
  }));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            {artistName ? (
              <>
                Content Radar ·{" "}
                <Link
                  href="/roster"
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  all artists
                </Link>
              </>
            ) : (
              "Content Radar"
            )}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {artistName ? `Rising for ${artistName}` : "Rising in your catalog"}
          </h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            The agent watches momentum across markets and surfaces the moments
            worth acting on — newest first.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {opportunities.length} signal{opportunities.length === 1 ? "" : "s"}
          </span>
          <RefreshSignals />
        </div>
      </div>

      {error ? (
        <p className="mt-8 font-mono text-sm text-destructive">
          Could not load opportunities: {error.message}
        </p>
      ) : opportunities.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {opportunities.map((opportunity, i) => (
            <Link
              key={opportunity.id}
              href={`/engine/${opportunity.id}`}
              className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <OpportunityCard opportunity={opportunity} index={i} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
      <span className="size-2 animate-signal rounded-full bg-foreground" />
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
        No signals yet
      </p>
      <p className="max-w-sm text-balance text-sm text-muted-foreground">
        Onboard an artist and run a signal poll. As momentum accelerates,
        opportunities will appear here automatically.
      </p>
      <Link
        href="/onboard"
        className="mt-2 rounded-lg border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-foreground transition-colors hover:bg-secondary"
      >
        Onboard an artist
      </Link>
    </div>
  );
}
