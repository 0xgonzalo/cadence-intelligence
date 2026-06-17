import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { BriefView, type BriefRow } from "@/components/engine/BriefView";
import {
  PackagePreview,
  type PackageAssets,
} from "@/components/engine/PackagePreview";

export const dynamic = "force-dynamic";

function parseCopy(raw: unknown): BriefRow["copy"] {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  return {
    hook: typeof c.hook === "string" ? c.hook : undefined,
    body: typeof c.body === "string" ? c.body : undefined,
    captions: Array.isArray(c.captions)
      ? c.captions.filter((x): x is string => typeof x === "string")
      : undefined,
    script: typeof c.script === "string" ? c.script : undefined,
  };
}

export default async function ContentEnginePage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params;
  const supabase = await createClient();

  const { data: opp } = await supabase
    .from("content_opportunities")
    .select("id, reason, market, language, status, tracks(title, isrc)")
    .eq("id", opportunityId)
    .single();

  if (!opp) notFound();

  const { data: briefRows } = await supabase
    .from("briefs")
    .select("id, format, angle, market, language, copy, created_at")
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: true });

  const briefs: BriefRow[] = (briefRows ?? []).map((b) => ({
    id: b.id,
    format: b.format,
    angle: b.angle,
    market: b.market,
    language: b.language,
    copy: parseCopy(b.copy),
  }));

  const { data: pkg } = await supabase
    .from("content_packages")
    .select("status, assets")
    .eq("opportunity_id", opportunityId)
    .maybeSingle();

  const title = opp.tracks?.title ?? opp.tracks?.isrc ?? "Untitled track";

  return (
    <div className="space-y-8">
      <div className="border-b border-border pb-6">
        <Link
          href="/radar"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Radar
        </Link>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          Content Engine
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
        {opp.reason ? (
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {opp.reason}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {opp.market ? <Badge variant="default">◷ {opp.market}</Badge> : null}
          {opp.language ? (
            <Badge variant="outline">{opp.language}</Badge>
          ) : null}
          <Badge variant="outline">{opp.status}</Badge>
        </div>
        <Link
          href={`/collab/${opportunityId}`}
          className="mt-4 inline-flex font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
        >
          Collab Radar →
        </Link>
      </div>

      <BriefView opportunityId={opportunityId} briefs={briefs} />

      <PackagePreview
        opportunityId={opportunityId}
        status={pkg?.status ?? null}
        assets={(pkg?.assets ?? null) as PackageAssets}
        hasBriefs={briefs.length > 0}
      />
    </div>
  );
}
