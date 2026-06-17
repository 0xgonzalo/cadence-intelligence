import { describe, it, expect } from "vitest";
import { pickClipWindow } from "@/lib/intelligence/clip";

describe("pickClipWindow", () => {
  it("centers the window on the energy peak", () => {
    const curve = [0.1, 0.2, 0.9, 0.95, 0.3, 0.1];
    const w = pickClipWindow(curve, 6000);
    expect(w.startMs).toBeLessThan(w.endMs);
  });

  it("selects the max sustained-energy sub-window", () => {
    // 6 samples over 6000ms → 1000ms/sample; a 3000ms clip = 3 samples.
    const curve = [0.1, 0.2, 0.9, 0.95, 0.3, 0.1];
    const w = pickClipWindow(curve, 6000, 3000);
    expect(w).toEqual({ startMs: 2000, endMs: 5000 });
  });

  it("maps the window to real track milliseconds", () => {
    // 6 samples over 12000ms → 2000ms/sample; a 4000ms clip = 2 samples.
    const curve = [0, 0, 1, 1, 0, 0];
    const w = pickClipWindow(curve, 12000, 4000);
    expect(w.startMs).toBe(4000);
    expect(w.endMs).toBe(8000);
  });

  it("clamps a clip longer than the track to the whole track", () => {
    const curve = [0.2, 0.8, 0.4];
    const w = pickClipWindow(curve, 3000, 999999);
    expect(w).toEqual({ startMs: 0, endMs: 3000 });
  });

  it("returns a zero window for an empty curve", () => {
    expect(pickClipWindow([], 5000)).toEqual({ startMs: 0, endMs: 0 });
  });
});
