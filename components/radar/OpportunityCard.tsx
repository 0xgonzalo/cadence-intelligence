import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface RadarOpportunity {
  id: string;
  trackTitle: string;
  reason: string | null;
  market: string | null;
  language: string | null;
  status: string;
  delta: { metric: string; from: number; to: number; pct: number } | null;
  detectedAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  in_progress: "In Progress",
  ready: "Ready",
  dismissed: "Dismissed",
};

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

export function OpportunityCard({
  opportunity,
  index = 0,
}: {
  opportunity: RadarOpportunity;
  index?: number;
}) {
  const { trackTitle, reason, market, language, status, delta } = opportunity;
  const isNew = status === "new";
  const pct = delta ? Math.round(delta.pct * 100) : null;

  return (
    <Card
      className="animate-rise group relative overflow-hidden p-0 transition-colors hover:border-foreground/30"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      {/* hairline accent that lights up on hover */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-foreground/15 transition-colors group-hover:bg-foreground/40"
      />

      <div className="flex items-start justify-between gap-4 p-5 pb-3">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          <span
            className={cn(
              "size-1.5 rounded-full bg-foreground",
              isNew && "animate-signal",
            )}
          />
          Rising Signal
        </span>
        <Badge variant={isNew ? "solid" : "outline"}>
          {STATUS_LABEL[status] ?? status}
        </Badge>
      </div>

      <div className="px-5">
        <h3 className="text-lg font-semibold leading-tight tracking-tight">
          {trackTitle}
        </h3>
        {reason ? (
          <p className="mt-1 text-sm text-muted-foreground">{reason}</p>
        ) : null}
      </div>

      {delta ? (
        <div className="mt-4 flex items-end justify-between gap-4 border-t border-border px-5 py-4">
          <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
            <span aria-hidden className="text-base text-foreground">
              ▲
            </span>
            <span className="text-4xl font-semibold leading-none tracking-tight">
              {pct}
            </span>
            <span className="text-lg text-muted-foreground">%</span>
          </div>
          <div className="text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {delta.metric}
            </p>
            <p className="mt-0.5 font-mono text-sm tabular-nums text-foreground/80">
              {formatNumber(delta.from)}
              <span className="px-1 text-muted-foreground">→</span>
              {formatNumber(delta.to)}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4 border-t border-border px-5 py-4" />
      )}

      <div className="flex flex-wrap items-center gap-2 px-5 pb-5">
        {market ? <Badge variant="default">◷ {market}</Badge> : null}
        {language ? <Badge variant="outline">{language}</Badge> : null}
      </div>
    </Card>
  );
}
