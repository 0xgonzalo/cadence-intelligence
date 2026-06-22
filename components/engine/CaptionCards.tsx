"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface CaptionCard {
  platform: string;
  caption: string;
  hashtags: string[];
}

function formatCard(c: CaptionCard): string {
  const tags = c.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  return tags ? `${c.caption}\n\n${tags}` : c.caption;
}

/**
 * Caption cards — on-demand, ready-to-post captions drafted from the
 * opportunity's momentum/show signal. Ephemeral: generated client-side and not
 * persisted, regenerate any time.
 */
export function CaptionCards({ opportunityId }: { opportunityId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<CaptionCard[] | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  async function generate() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/captions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunityId }),
      });
      const json = (await res.json().catch(() => null)) as
        | { data?: { cards?: CaptionCard[] }; error?: string }
        | null;
      if (!res.ok) throw new Error(json?.error ?? `Caption generation failed (${res.status})`);
      setCards(json?.data?.cards ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Caption generation failed");
    } finally {
      setPending(false);
    }
  }

  async function copy(card: CaptionCard, idx: number) {
    try {
      await navigator.clipboard.writeText(formatCard(card));
      setCopied(idx);
      setTimeout(() => setCopied((c) => (c === idx ? null : c)), 1500);
    } catch {
      // clipboard blocked — no-op
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
            Caption Cards
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ready-to-post captions drafted from this signal — milestones, tour
            moments, and the why-now. No audio needed.
          </p>
        </div>
        <Button onClick={generate} disabled={pending}>
          {pending ? "Drafting…" : cards ? "Regenerate" : "Generate captions"}
        </Button>
      </div>

      {error ? (
        <p className="mt-3 font-mono text-sm text-destructive">{error}</p>
      ) : null}

      {cards && cards.length > 0 ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card, idx) => (
            <Card key={idx} className="flex flex-col gap-3 border-dashed p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {card.platform}
                </p>
                <button
                  type="button"
                  onClick={() => copy(card, idx)}
                  className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {copied === idx ? "Copied ✓" : "Copy"}
                </button>
              </div>
              <p className="whitespace-pre-wrap text-sm">{card.caption}</p>
              {card.hashtags.length > 0 ? (
                <p className="text-[12px] text-muted-foreground">
                  {card.hashtags
                    .map((t) => (t.startsWith("#") ? t : `#${t}`))
                    .join(" ")}
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      ) : cards && cards.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No captions generated — try regenerating.
        </p>
      ) : null}
    </Card>
  );
}
