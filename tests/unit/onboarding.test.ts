import { describe, expect, it } from "vitest";
import { parseIsrcs } from "@/lib/onboarding";

describe("parseIsrcs", () => {
  it("splits on newlines and commas", () => {
    expect(parseIsrcs("USRC17600001\nGBUM71029604, FRUM71200123")).toEqual([
      "USRC17600001",
      "GBUM71029604",
      "FRUM71200123",
    ]);
  });

  it("trims whitespace and uppercases", () => {
    expect(parseIsrcs("  usrc17600001  ")).toEqual(["USRC17600001"]);
  });

  it("drops blank entries", () => {
    expect(parseIsrcs("USRC17600001\n\n,  ,\nGBUM71029604")).toEqual([
      "USRC17600001",
      "GBUM71029604",
    ]);
  });

  it("dedupes while preserving first-seen order", () => {
    expect(parseIsrcs("USRC17600001\nusrc17600001\nGBUM71029604")).toEqual([
      "USRC17600001",
      "GBUM71029604",
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseIsrcs("")).toEqual([]);
    expect(parseIsrcs("   \n  ")).toEqual([]);
  });
});
