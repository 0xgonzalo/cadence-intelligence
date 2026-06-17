"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LogRow {
  id: string;
  level: string;
  phase: string | null;
  message: string;
  created_at: string;
}

const POLL_MS = 3000;

const LEVEL_DOT: Record<string, string> = {
  debug: "bg-muted-foreground/40",
  info: "bg-emerald-500",
  warn: "bg-amber-500",
  error: "bg-destructive",
};

function time(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

export function LiveLog() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const supabaseRef = useRef(createClient());

  const load = useCallback(async () => {
    const { data } = await supabaseRef.current
      .from("agent_log")
      .select("id, level, phase, message, created_at")
      .order("created_at", { ascending: false })
      .limit(60);
    if (data) setRows(data as LogRow[]);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  async function runNow() {
    setRunning(true);
    setNote(null);
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Run failed");
      setNote(
        json.data?.opportunityId
          ? `Run finished — package ${json.data.status}`
          : "No new opportunities to run",
      );
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            Live activity
          </p>
        </div>
        <div className="flex items-center gap-3">
          {note ? (
            <span className="font-mono text-[11px] text-muted-foreground">
              {note}
            </span>
          ) : null}
          <Button onClick={runNow} disabled={running}>
            {running ? "Running…" : "Run now"}
          </Button>
        </div>
      </div>

      <Card className="divide-y divide-border p-0">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No activity yet. Trigger a run, or let the agent loop pick up the next
            opportunity.
          </p>
        ) : (
          rows.map((r) => (
            <div
              key={r.id}
              className="flex items-start gap-3 px-4 py-2.5 text-sm"
            >
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  LEVEL_DOT[r.level] ?? "bg-muted-foreground/40",
                )}
              />
              <span className="w-16 shrink-0 font-mono text-[11px] text-muted-foreground">
                {time(r.created_at)}
              </span>
              {r.phase ? (
                <span className="w-20 shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/80">
                  {r.phase}
                </span>
              ) : (
                <span className="w-20 shrink-0" />
              )}
              <span className="flex-1 leading-snug">{r.message}</span>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
