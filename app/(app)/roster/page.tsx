import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RosterRow {
  id: string;
  name: string;
  /** Count of open opportunities (momentum + event-driven). */
  opportunities: number;
  /** Aggregate fractional growth across open opps (sum of detection deltas). */
  momentum: number;
  /** Hottest single delta, for display. */
  topPct: number | null;
}

function pctOf(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const pct = Number((raw as Record<string, unknown>).pct);
  return Number.isFinite(pct) ? pct : null;
}

export default async function RosterPage() {
  const supabase = await createClient();
  const [{ data: artists }, { data: opps, error }] = await Promise.all([
    supabase.from("artists").select("id, name"),
    supabase
      .from("content_opportunities")
      .select("artist_id, signal_delta, status")
      .in("status", ["new", "in_progress"]),
  ]);

  const byArtist = new Map<
    string,
    { count: number; momentum: number; topPct: number | null }
  >();
  for (const o of opps ?? []) {
    const agg = byArtist.get(o.artist_id) ?? {
      count: 0,
      momentum: 0,
      topPct: null,
    };
    agg.count += 1;
    const pct = pctOf(o.signal_delta);
    if (pct !== null) {
      agg.momentum += pct;
      agg.topPct = agg.topPct === null ? pct : Math.max(agg.topPct, pct);
    }
    byArtist.set(o.artist_id, agg);
  }

  const roster: RosterRow[] = (artists ?? [])
    .map((a) => {
      const agg = byArtist.get(a.id);
      return {
        id: a.id,
        name: a.name,
        opportunities: agg?.count ?? 0,
        momentum: agg?.momentum ?? 0,
        topPct: agg?.topPct ?? null,
      };
    })
    .sort(
      (a, b) =>
        b.momentum - a.momentum ||
        b.opportunities - a.opportunities ||
        a.name.localeCompare(b.name),
    );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            Label · Roster
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Your roster, by momentum
          </h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Every artist ranked by the aggregate acceleration the agent is
            tracking right now. Open one to drop into its Content Radar.
          </p>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {roster.length} artist{roster.length === 1 ? "" : "s"}
        </span>
      </div>

      {error ? (
        <p className="mt-8 font-mono text-sm text-destructive">
          Could not load roster: {error.message}
        </p>
      ) : roster.length === 0 ? (
        <EmptyState />
      ) : (
        <ol className="mt-8 flex flex-col gap-2">
          {roster.map((row, i) => (
            <li key={row.id}>
              <Link
                href={`/radar?artist=${row.id}`}
                className="group flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 outline-none transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="w-6 shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium tracking-tight">
                    {row.name}
                  </p>
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    {row.opportunities} open signal
                    {row.opportunities === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={`font-mono text-sm tabular-nums ${
                      row.topPct !== null ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {row.topPct !== null
                      ? `+${Math.round(row.topPct * 100)}%`
                      : "—"}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    peak
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
      <span className="size-2 animate-signal rounded-full bg-foreground" />
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
        No artists yet
      </p>
      <p className="max-w-sm text-balance text-sm text-muted-foreground">
        Onboard artists to build your roster. As the agent detects momentum,
        they&apos;ll rank here by aggregate acceleration.
      </p>
    </div>
  );
}
