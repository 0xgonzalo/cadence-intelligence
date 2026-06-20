"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreatorCard, type CreatorLead } from "@/components/collab/CreatorCard";

const GAP_NOTE =
  "Creator discovery is limited to Songstats TikTok UGC leads — the only partner source that returns real creator handles. Cyanite adjacency returns tracks, not creators, so none here are fabricated.";

export function CollabRadar({
  opportunityId,
  leads,
}: {
  opportunityId: string;
  leads: CreatorLead[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [foundNone, setFoundNone] = useState(false);

  async function findCreators() {
    setPending(true);
    setError(null);
    setFoundNone(false);
    try {
      const res = await fetch("/api/collab", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunityId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Collab search failed");
      setFoundNone(Array.isArray(json.data) && json.data.length === 0);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Collab search failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose font-mono text-[11px] leading-relaxed text-muted-foreground">
          {GAP_NOTE}
        </p>
        <Button onClick={findCreators} disabled={pending}>
          {pending
            ? "Scanning…"
            : leads.length > 0
              ? "Refresh creators"
              : "Find creators"}
        </Button>
      </div>

      {error ? (
        <p className="font-mono text-sm text-destructive">{error}</p>
      ) : null}

      {leads.length === 0 ? (
        <Card className="border-dashed p-10 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            {foundNone ? "No creators found" : "No leads yet"}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            {foundNone
              ? "Scan complete — Songstats has no TikTok UGC creators for this track yet. Check back as the track picks up activity."
              : "Scan for real TikTok UGC creators driving this track, ranked by market overlap, reach, and fit — with an outreach draft for the top leads."}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {leads.map((lead, i) => (
            <CreatorCard key={lead.id} lead={lead} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
