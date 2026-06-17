import { cn } from "@/lib/utils";

/**
 * Inline SVG sparkline of a track's energy curve (normalized 0..1 internally).
 * Presentational only — no interactivity, renders on the server.
 */
export function EnergyCurve({
  curve,
  className,
}: {
  curve: number[];
  className?: string;
}) {
  if (curve.length < 2) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        No energy data
      </p>
    );
  }

  const W = 100;
  const H = 28;
  const min = Math.min(...curve);
  const max = Math.max(...curve);
  const span = max - min || 1;
  const points = curve.map((v, i) => {
    const x = (i / (curve.length - 1)) * W;
    const y = H - ((v - min) / span) * H;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn("h-12 w-full text-foreground", className)}
      role="img"
      aria-label="Energy curve"
    >
      <polyline
        points={`0,${H} ${points.join(" ")} ${W},${H}`}
        fill="currentColor"
        fillOpacity={0.08}
        stroke="none"
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
