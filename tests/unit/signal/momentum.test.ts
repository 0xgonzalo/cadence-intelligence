import { describe, it, expect } from "vitest";
import { detectOpportunities } from "@/lib/signal/momentum";
import type { MomentumSignal } from "@/lib/domain/types";

describe("detectOpportunities", () => {
  it("flags acceleration over threshold", () => {
    const sigs: MomentumSignal[] = [
      { trackId: "t1", metric: "streams", value: 100, market: "BR", capturedAt: "2026-06-10" },
      { trackId: "t1", metric: "streams", value: 180, market: "BR", capturedAt: "2026-06-16" },
    ];
    const ops = detectOpportunities(sigs, { accelerationPct: 0.5 });
    expect(ops[0].trackId).toBe("t1");
    expect(ops[0].market).toBe("BR");
    expect(ops[0].signalDelta.pct).toBeCloseTo(0.8);
  });

  it("does not flag growth at or below threshold", () => {
    const sigs: MomentumSignal[] = [
      { trackId: "t1", metric: "streams", value: 100, market: "BR", capturedAt: "2026-06-10" },
      { trackId: "t1", metric: "streams", value: 120, market: "BR", capturedAt: "2026-06-16" },
    ];
    expect(detectOpportunities(sigs, { accelerationPct: 0.5 })).toHaveLength(0);
  });

  it("ignores a metric with only one capture", () => {
    const sigs: MomentumSignal[] = [
      { trackId: "t1", metric: "streams", value: 100, market: "BR", capturedAt: "2026-06-10" },
    ];
    expect(detectOpportunities(sigs, { accelerationPct: 0.5 })).toHaveLength(0);
  });

  it("ranks opportunities by delta descending", () => {
    const sigs: MomentumSignal[] = [
      { trackId: "slow", metric: "streams", value: 100, market: "BR", capturedAt: "2026-06-10" },
      { trackId: "slow", metric: "streams", value: 200, market: "BR", capturedAt: "2026-06-16" },
      { trackId: "fast", metric: "streams", value: 100, market: "US", capturedAt: "2026-06-10" },
      { trackId: "fast", metric: "streams", value: 400, market: "US", capturedAt: "2026-06-16" },
    ];
    const ops = detectOpportunities(sigs, { accelerationPct: 0.5 });
    expect(ops.map((o) => o.trackId)).toEqual(["fast", "slow"]);
  });

  it("uses the two most recent captures regardless of input order", () => {
    const sigs: MomentumSignal[] = [
      { trackId: "t1", metric: "streams", value: 180, market: "BR", capturedAt: "2026-06-16" },
      { trackId: "t1", metric: "streams", value: 50, market: "BR", capturedAt: "2026-06-01" },
      { trackId: "t1", metric: "streams", value: 100, market: "BR", capturedAt: "2026-06-10" },
    ];
    const ops = detectOpportunities(sigs, { accelerationPct: 0.5 });
    expect(ops).toHaveLength(1);
    expect(ops[0].signalDelta.from).toBe(100);
    expect(ops[0].signalDelta.to).toBe(180);
  });
});
