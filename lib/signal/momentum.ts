import type {
  ContentOpportunity,
  MomentumSignal,
  SignalDelta,
  Thresholds,
} from "@/lib/domain/types";

/**
 * Detect content opportunities from a stream of point-in-time signals. Signals
 * are grouped by (track, metric, market); within each group the two most recent
 * captures are compared, and a fractional growth strictly above
 * `thresholds.accelerationPct` raises one opportunity. Results are sorted by
 * growth descending so the hottest movers surface first.
 */
export function detectOpportunities(
  signals: MomentumSignal[],
  thresholds: Thresholds,
): ContentOpportunity[] {
  const groups = new Map<string, MomentumSignal[]>();
  for (const sig of signals) {
    const key = `${sig.trackId}|${sig.metric}|${sig.market}`;
    const group = groups.get(key);
    if (group) group.push(sig);
    else groups.set(key, [sig]);
  }

  const opportunities: ContentOpportunity[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(
      (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt),
    );
    const previous = sorted[sorted.length - 2];
    const latest = sorted[sorted.length - 1];
    if (previous.value <= 0) continue;

    const pct = (latest.value - previous.value) / previous.value;
    if (pct <= thresholds.accelerationPct) continue;

    const signalDelta: SignalDelta = {
      metric: latest.metric,
      market: latest.market,
      from: previous.value,
      to: latest.value,
      pct,
      fromAt: previous.capturedAt,
      toAt: latest.capturedAt,
    };

    opportunities.push({
      trackId: latest.trackId,
      market: latest.market,
      reason: `${latest.metric} +${Math.round(pct * 100)}% in ${latest.market}`,
      status: "new",
      signalDelta,
    });
  }

  return opportunities.sort((a, b) => b.signalDelta.pct - a.signalDelta.pct);
}
