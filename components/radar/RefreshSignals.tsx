"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RefreshSignals() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const busy = running || pending;

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/signal/run", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Poll failed");
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Poll failed");
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
        className="rounded-lg border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
      >
        {busy ? "Polling…" : "↻ Refresh signals"}
      </button>
      {error ? (
        <span className="font-mono text-[11px] text-destructive">{error}</span>
      ) : null}
    </div>
  );
}
