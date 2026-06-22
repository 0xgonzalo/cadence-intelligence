"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function AnalyzeButton({
  trackId,
  analyzed,
}: {
  trackId: string;
  analyzed: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const busy = running || pending;

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/intelligence/${trackId}`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Analysis failed");
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="group inline-flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-brand-bright transition-all hover:bg-brand/12 hover:[box-shadow:0_0_24px_-8px_var(--brand)] disabled:opacity-60"
      >
        <span
          aria-hidden
          className={cn(
            "inline-block size-3 rounded-full border border-current border-t-transparent",
            busy
              ? "animate-spin-slow"
              : "border-solid bg-brand [box-shadow:0_0_8px_1px_var(--brand)] [border-color:transparent]",
          )}
        />
        {busy
          ? "Analyzing…"
          : analyzed
            ? "Re-run intelligence"
            : "Run intelligence pass"}
      </button>
      {error ? (
        <span className="font-mono text-[11px] text-destructive">{error}</span>
      ) : null}
    </div>
  );
}
