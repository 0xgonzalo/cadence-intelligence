import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface CreatorLead {
  id: string;
  handle: string;
  source: string | null;
  market: string | null;
  fitScore: number | null;
  reach: number | null;
  rationale: string | null;
  outreachDraft: string | null;
}

const SOURCE_LABEL: Record<string, string> = {
  "songstats-tiktok": "TikTok UGC",
};

function formatReach(n: number | null): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString("en-US");
}

export function CreatorCard({
  lead,
  index = 0,
}: {
  lead: CreatorLead;
  index?: number;
}) {
  const fitPct = lead.fitScore != null ? Math.round(lead.fitScore * 100) : null;
  const reach = formatReach(lead.reach);

  return (
    <Card
      className="animate-rise p-5"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold tracking-tight">
            {lead.handle.startsWith("@") ? lead.handle : `@${lead.handle}`}
          </h3>
          {lead.source ? (
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              {SOURCE_LABEL[lead.source] ?? lead.source}
            </p>
          ) : null}
        </div>
        {fitPct != null ? (
          <div className="text-right font-mono tabular-nums">
            <span className="text-2xl font-semibold leading-none">{fitPct}</span>
            <span className="text-sm text-muted-foreground">%</span>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Fit
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {lead.market ? <Badge variant="default">◷ {lead.market}</Badge> : null}
        {reach ? <Badge variant="outline">{reach} reach</Badge> : null}
      </div>

      {lead.rationale ? (
        <p className="mt-3 text-sm text-muted-foreground">{lead.rationale}</p>
      ) : null}

      {lead.outreachDraft ? (
        <div className="mt-4 border-t border-border/60 pt-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Outreach draft
          </p>
          <p className="mt-1.5 whitespace-pre-line text-[13px] text-foreground/90">
            {lead.outreachDraft}
          </p>
        </div>
      ) : null}
    </Card>
  );
}
