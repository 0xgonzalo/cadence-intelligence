import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface RadarOpportunity {
  id: string;
  kind: "track" | "show";
  title: string;
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
  const { kind, title, reason, market, language, status, delta } = opportunity;
  const isNew = status === "new";
  const signalLabel = kind === "show" ? "Live Signal" : "Rising Signal";
  const pct = delta ? Math.round(delta.pct * 100) : null;

  return (
    <Card
      className="animate-rise group relative overflow-hidden p-0 transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_24px_60px_-30px_var(--brand)]"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      {/* hairline accent that ignites teal on hover */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-foreground/15 transition-all duration-300 group-hover:bg-brand group-hover:[box-shadow:0_0_12px_1px_var(--brand)]"
      />
      {/* corner phosphor bloom, revealed on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-brand/20 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
      />

      <div className="relative flex items-start justify-between gap-4 p-5 pb-3">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          <span
            className={cn(
              "size-1.5 rounded-full bg-brand",
              isNew && "animate-signal",
            )}
          />
          {signalLabel}
        </span>
        <Badge variant={isNew ? "brand" : "outline"}>
          {STATUS_LABEL[status] ?? status}
        </Badge>
      </div>

      <div className="relative px-5">
        <h3 className="text-lg font-semibold leading-tight tracking-tight transition-colors group-hover:text-brand-bright">
          {title}
        </h3>
        {reason ? (
          <p className="mt-1 text-sm text-muted-foreground">{reason}</p>
        ) : null}
      </div>

      {delta ? (
        <div className="relative mt-4 flex items-end justify-between gap-4 border-t border-border px-5 py-4">
          <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
            <span aria-hidden className="text-base text-brand-bright">
              ▲
            </span>
            <span className="text-4xl font-semibold leading-none tracking-tight text-brand-bright [text-shadow:0_0_24px_var(--brand-muted)]">
              {pct}
            </span>
            <span className="text-lg text-brand-bright/70">%</span>
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
