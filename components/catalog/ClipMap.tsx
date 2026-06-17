import { cn } from "@/lib/utils";

function fmt(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Horizontal map of the recommended clip window over the full track duration.
 * Presentational only — renders on the server.
 */
export function ClipMap({
  durationMs,
  startMs,
  endMs,
  className,
}: {
  durationMs: number;
  startMs: number | null;
  endMs: number | null;
  className?: string;
}) {
  const hasWindow =
    startMs !== null && endMs !== null && durationMs > 0 && endMs > startMs;

  if (!hasWindow) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        No clip window
      </p>
    );
  }

  const left = (startMs! / durationMs) * 100;
  const width = ((endMs! - startMs!) / durationMs) * 100;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="relative h-3 overflow-hidden rounded-full bg-secondary">
        <span
          className="absolute inset-y-0 rounded-full bg-foreground"
          style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
        />
      </div>
      <div className="flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
        <span>0:00</span>
        <span className="text-foreground">
          {fmt(startMs!)}–{fmt(endMs!)}
        </span>
        <span>{fmt(durationMs)}</span>
      </div>
    </div>
  );
}
