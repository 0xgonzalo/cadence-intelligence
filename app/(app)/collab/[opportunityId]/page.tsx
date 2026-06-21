import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { CollabRadar } from "@/components/collab/CollabRadar";
import type { CreatorLead } from "@/components/collab/CreatorCard";

export const dynamic = "force-dynamic";

export default async function CollabRadarPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params;
  const supabase = await createClient();

  const { data: opp } = await supabase
    .from("content_opportunities")
    .select("id, reason, market, language, status, tracks(title, isrc), artists(name)")
    .eq("id", opportunityId)
    .single();

  if (!opp) notFound();

  const { data: leadRows } = await supabase
    .from("collab_leads")
    .select("id, handle, source, market, fit_score, reach, rationale, outreach_draft")
    .eq("opportunity_id", opportunityId)
    .order("fit_score", { ascending: false, nullsFirst: false });

  const leads: CreatorLead[] = (leadRows ?? []).map((l) => ({
    id: l.id,
    handle: l.handle,
    source: l.source,
    market: l.market,
    fitScore: l.fit_score,
    reach: l.reach,
    rationale: l.rationale,
    outreachDraft: l.outreach_draft,
  }));

  const title =
    opp.tracks?.title ?? opp.tracks?.isrc ?? opp.artists?.name ?? "Untitled signal";

  return (
    <div className="space-y-8">
      <div className="border-b border-border pb-6">
        <Link
          href={`/engine/${opportunityId}`}
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Content Engine
        </Link>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          Collab Radar
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
        {opp.reason ? (
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {opp.reason}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {opp.market ? <Badge variant="default">◷ {opp.market}</Badge> : null}
          {opp.language ? <Badge variant="outline">{opp.language}</Badge> : null}
          <Badge variant="outline">{opp.status}</Badge>
        </div>
      </div>

      <CollabRadar opportunityId={opportunityId} leads={leads} />
    </div>
  );
}
