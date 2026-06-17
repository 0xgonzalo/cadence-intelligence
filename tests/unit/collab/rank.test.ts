import { describe, it, expect } from "vitest";
import { rankCreators } from "@/lib/collab/rank";

describe("rankCreators", () => {
  it("ranks higher market-overlap + reach first", () => {
    const out = rankCreators(
      [
        { handle: "a", markets: ["BR"], reach: 100, fit: 0.4 },
        { handle: "b", markets: ["BR"], reach: 500, fit: 0.9 },
      ],
      { artistMarkets: ["BR"] },
    );
    expect(out[0].handle).toBe("b");
  });

  it("weights market overlap above raw reach", () => {
    const out = rankCreators(
      [
        // huge reach but no overlap with the artist's markets
        { handle: "global", markets: ["US"], reach: 1_000_000, fit: 0.5 },
        // modest reach but a perfect market match
        { handle: "local", markets: ["BR"], reach: 10_000, fit: 0.5 },
      ],
      { artistMarkets: ["BR"] },
    );
    expect(out[0].handle).toBe("local");
  });

  it("breaks ties by reach", () => {
    const out = rankCreators(
      [
        { handle: "low", markets: ["BR"], reach: 100, fit: 0.5 },
        { handle: "high", markets: ["BR"], reach: 900, fit: 0.5 },
      ],
      { artistMarkets: ["BR"] },
    );
    // identical overlap + fit → reach is the tiebreaker
    expect(out.map((c) => c.handle)).toEqual(["high", "low"]);
  });

  it("attaches a numeric score and preserves candidate fields", () => {
    const out = rankCreators(
      [{ handle: "a", markets: ["BR"], reach: 100, fit: 0.4, source: "tiktok" }],
      { artistMarkets: ["BR"] },
    );
    expect(out[0]).toMatchObject({ handle: "a", source: "tiktok" });
    expect(typeof out[0].score).toBe("number");
  });

  it("returns an empty array for no candidates", () => {
    expect(rankCreators([], { artistMarkets: ["BR"] })).toEqual([]);
  });
});
