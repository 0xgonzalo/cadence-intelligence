import { describe, it, expect } from "vitest";
import { metricLabel, momentumReason } from "@/lib/signal/metric-label";

describe("metricLabel", () => {
  it("maps known Songstats keys to human labels", () => {
    expect(metricLabel("charted_countries_total")).toBe("Charted countries");
    expect(metricLabel("spotify_streams_total")).toBe("Spotify streams");
    expect(metricLabel("tiktok_views_total")).toBe("TikTok views");
  });

  it("prettifies unknown keys by dropping noisy suffixes", () => {
    expect(metricLabel("monthly_listeners_current")).toBe("Monthly listeners");
    expect(metricLabel("saves_total")).toBe("Saves");
  });

  it("never leaks a raw underscore-style key", () => {
    expect(metricLabel("some_unmapped_metric_total")).not.toContain("_");
  });

  it("falls back to a label for an empty metric", () => {
    expect(metricLabel("")).toBe("Signal");
  });
});

describe("momentumReason", () => {
  it("builds a readable reason with a rounded percent", () => {
    expect(momentumReason("charted_countries_total", 8.834, "global")).toBe(
      "Charted countries +883% in global",
    );
  });

  it("defaults a null market to global", () => {
    expect(momentumReason("streams_total", 0.5, null)).toBe(
      "Total streams +50% in global",
    );
  });
});
