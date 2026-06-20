"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Beat = { time: string; label: string; action: string };

export interface BriefRow {
  id: string;
  format: string;
  angle: string | null;
  market: string | null;
  language: string | null;
  copy: {
    hook?: string;
    angle?: string;
    concept?: string;
    whyItWorks?: string;
    beats?: Beat[];
    captions?: string[];
    script?: string;
    /** Legacy single-draft body (pre-detailed-plan rows). */
    body?: string;
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

type FormatMeta = {
  accent: string;
  aspect: "vertical" | "square" | "stack";
  video: boolean;
  blurb: string;
};

/** Per-format accent + frame shape — drives the at-a-glance visual coding. */
const FORMAT_META: Record<string, FormatMeta> = {
  reel: { accent: "oklch(0.72 0.17 18)", aspect: "vertical", video: true, blurb: "9:16 · 15–30s" },
  tiktok: { accent: "oklch(0.80 0.13 195)", aspect: "vertical", video: true, blurb: "9:16 · 15–45s" },
  short: { accent: "oklch(0.70 0.20 25)", aspect: "vertical", video: true, blurb: "9:16 · <60s" },
  lyricVideo: { accent: "oklch(0.82 0.14 95)", aspect: "vertical", video: true, blurb: "Kinetic · 15–30s" },
  staticPost: { accent: "oklch(0.72 0.13 285)", aspect: "square", video: false, blurb: "1:1 · single frame" },
  carousel: { accent: "oklch(0.78 0.14 150)", aspect: "stack", video: false, blurb: "5–7 slides" },
  faceless: { accent: "oklch(0.74 0.04 250)", aspect: "vertical", video: true, blurb: "B-roll · VO" },
};

function metaFor(format: string): FormatMeta {
  return (
    FORMAT_META[format] ?? {
      accent: "var(--muted-foreground)",
      aspect: "square",
      video: false,
      blurb: "",
    }
  );
}

/** A tiny aspect-ratio frame so each format reads instantly (vertical/square/stack). */
function FormatMark({ format }: { format: string }) {
  const m = metaFor(format);
  if (m.aspect === "stack") {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden style={{ color: m.accent }}>
        <rect x="6" y="3" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
        <rect x="3" y="6" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  const isV = m.aspect === "vertical";
  const w = isV ? 12 : 16;
  const h = isV ? 18 : 16;
  const x = (22 - w) / 2;
  const y = (22 - h) / 2;
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden style={{ color: m.accent }}>
      <rect x={x} y={y} width={w} height={h} rx="2" stroke="currentColor" strokeWidth="1.5" />
      {m.video ? <path d="M9.5 8 L14 11 L9.5 14 Z" fill="currentColor" /> : null}
    </svg>
  );
}

function previewOf(copy: BriefRow["copy"]): string {
  return copy?.concept ?? copy?.body ?? copy?.captions?.[0] ?? "";
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1400);
        } catch {
          // clipboard unavailable — no-op
        }
      }}
      className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function Section({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          {label}
        </p>
        {action}
      </div>
      {children}
    </section>
  );
}

function BriefDetail({ row, onClose }: { row: BriefRow; onClose: () => void }) {
  const m = metaFor(row.format);
  const copy = row.copy ?? {};
  const beats = copy.beats ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
      />
      <div className="animate-rise relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:m-4 sm:rounded-2xl">
        <div className="h-1 w-full shrink-0" style={{ backgroundColor: m.accent }} />

        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <FormatMark format={row.format} />
            <div>
              <h3 className="text-lg font-semibold tracking-tight">
                {FORMAT_LABEL[row.format] ?? row.format}
              </h3>
              {m.blurb ? (
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {m.blurb}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {row.market ? <Badge variant="default">◷ {row.market}</Badge> : null}
            {row.language ? <Badge variant="outline">{row.language}</Badge> : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ml-1 rounded-md border border-border px-2 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
            >
              Esc
            </button>
          </div>
        </div>

        <div className="space-y-7 overflow-y-auto px-6 py-6">
          {copy.hook ? (
            <p className="text-xl font-semibold leading-snug tracking-tight">
              “{copy.hook}”
            </p>
          ) : null}

          {copy.concept ? (
            <Section label="Concept">
              <p className="text-sm leading-relaxed text-foreground/90">
                {copy.concept}
              </p>
            </Section>
          ) : null}

          {copy.whyItWorks ? (
            <Section label="Why this works">
              <div
                className="rounded-lg border-l-2 bg-secondary/40 px-4 py-3"
                style={{ borderColor: m.accent }}
              >
                <p className="text-sm leading-relaxed text-foreground/90">
                  {copy.whyItWorks}
                </p>
              </div>
            </Section>
          ) : null}

          {beats.length ? (
            <Section label="Structure · time rules">
              <ol>
                {beats.map((b, i) => (
                  <li key={i} className="flex gap-4 pb-6 last:pb-0">
                    <div className="flex flex-col items-center">
                      <span
                        className="z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2"
                        style={{
                          borderColor: m.accent,
                          backgroundColor: i === 0 ? m.accent : "transparent",
                        }}
                      />
                      {i < beats.length - 1 ? (
                        <span className="mt-1 w-px flex-1 bg-border" />
                      ) : null}
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="font-mono text-[12px] tabular-nums"
                          style={{ color: m.accent }}
                        >
                          {b.time}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                          {b.label}
                          {i === 0 ? " · hook" : ""}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-foreground/90">
                        {b.action}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          ) : copy.body ? (
            <Section label="Draft">
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                {copy.body}
              </p>
            </Section>
          ) : null}

          {copy.script ? (
            <Section label="Voiceover / script" action={<CopyButton text={copy.script} />}>
              <p className="whitespace-pre-line rounded-lg border border-border bg-secondary/30 px-4 py-3 text-sm leading-relaxed text-foreground/90">
                {copy.script}
              </p>
            </Section>
          ) : null}

          {copy.captions && copy.captions.length > 0 ? (
            <Section label="Captions">
              <ul className="space-y-2">
                {copy.captions.map((c, i) => (
                  <li
                    key={i}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border px-4 py-3"
                  >
                    <span className="text-sm leading-relaxed text-foreground/90">
                      {c}
                    </span>
                    <CopyButton text={c} />
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

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
  const [active, setActive] = useState<BriefRow | null>(null);

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

  // Group briefs by language so each localization is its own section of formats.
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
        <div className="space-y-8">
          {[...byLang.entries()].map(([lang, rows]) => (
            <div key={lang} className="space-y-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                Content · {lang}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {rows.map((b, i) => {
                  const m = metaFor(b.format);
                  const beats = b.copy?.beats ?? [];
                  const hookTime = beats[0]?.time ?? null;
                  const preview = previewOf(b.copy);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setActive(b)}
                      style={{ animationDelay: `${i * 40}ms` }}
                      className="group animate-rise relative overflow-hidden rounded-xl border border-border bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
                    >
                      <span
                        className="absolute inset-x-0 top-0 h-0.5"
                        style={{ backgroundColor: m.accent }}
                      />
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <FormatMark format={b.format} />
                          <h3 className="text-base font-semibold tracking-tight">
                            {FORMAT_LABEL[b.format] ?? b.format}
                          </h3>
                        </div>
                        {b.market ? (
                          <Badge variant="default">◷ {b.market}</Badge>
                        ) : null}
                      </div>

                      {preview ? (
                        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-foreground/90">
                          {preview}
                        </p>
                      ) : null}

                      <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
                        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                          {beats.length ? <span>{beats.length} beats</span> : null}
                          {hookTime ? (
                            <span style={{ color: m.accent }}>◷ {hookTime}</span>
                          ) : (
                            <span>{m.blurb}</span>
                          )}
                        </div>
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors group-hover:text-foreground">
                          Open →
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {active ? (
        <BriefDetail row={active} onClose={() => setActive(null)} />
      ) : null}
    </div>
  );
}
