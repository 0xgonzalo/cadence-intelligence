"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface BriefRow {
  id: string;
  format: string;
  angle: string | null;
  market: string | null;
  language: string | null;
  copy: {
    hook?: string;
    body?: string;
    captions?: string[];
    script?: string;
  } | null;
}

const FORMAT_LABEL: Record<string, string> = {
  reel: "Reel",
  tiktok: "TikTok",
  short: "Short",
  lyricVideo: "Lyric Video",
  staticPost: "Static Post",
  carousel: "Carousel",
  faceless: "Faceless",
};

export function BriefView({
  opportunityId,
  briefs,
}: {
  opportunityId: string;
  briefs: BriefRow[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunityId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generation failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setPending(false);
    }
  }

  // Group briefs by language so each localization is its own column of formats.
  const byLang = new Map<string, BriefRow[]>();
  for (const b of briefs) {
    const lang = b.language ?? "—";
    if (!byLang.has(lang)) byLang.set(lang, []);
    byLang.get(lang)!.push(b);
  }
  const angle = briefs.find((b) => b.angle)?.angle ?? null;
  const hook = briefs.find((b) => b.copy?.hook)?.copy?.hook ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {angle ? <Badge variant="solid">{angle}</Badge> : null}
          {[...byLang.keys()].map((lang) => (
            <Badge key={lang} variant="outline">
              {lang}
            </Badge>
          ))}
        </div>
        <Button onClick={generate} disabled={pending}>
          {pending
            ? "Generating…"
            : briefs.length > 0
              ? "Regenerate"
              : "Generate brief"}
        </Button>
      </div>

      {error ? (
        <p className="font-mono text-sm text-destructive">{error}</p>
      ) : null}

      {hook ? (
        <Card className="p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
            Hook
          </p>
          <p className="mt-2 text-xl font-semibold tracking-tight">“{hook}”</p>
        </Card>
      ) : null}

      {briefs.length === 0 ? (
        <Card className="border-dashed p-10 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            No brief yet
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Generate a multiformat, multilingual content brief from this
            opportunity&rsquo;s momentum and intelligence.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {[...byLang.entries()].map(([lang, rows]) => (
            <div key={lang} className="space-y-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                Copy · {lang}
              </p>
              {rows.map((b) => (
                <Card key={b.id} className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold tracking-tight">
                      {FORMAT_LABEL[b.format] ?? b.format}
                    </h3>
                    {b.market ? (
                      <Badge variant="default">◷ {b.market}</Badge>
                    ) : null}
                  </div>
                  {b.copy?.body ? (
                    <p className="mt-3 whitespace-pre-line text-sm text-foreground/90">
                      {b.copy.body}
                    </p>
                  ) : null}
                  {b.copy?.captions && b.copy.captions.length > 0 ? (
                    <ul className="mt-3 space-y-1 border-t border-border/60 pt-3">
                      {b.copy.captions.map((c, i) => (
                        <li
                          key={i}
                          className="text-[13px] text-muted-foreground"
                        >
                          {c}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Card>
              ))}
            </div>
          ))}
        </div>
      )}

      <Card className="border-dashed p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
          Content Package
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Stems, voiceover and a lyric clip assemble here once the asset layer
          ships (Phase 4).
        </p>
      </Card>
    </div>
  );
}
