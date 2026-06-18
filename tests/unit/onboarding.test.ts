import { describe, expect, it } from "vitest";
import { normalizeOnboardTracks } from "@/lib/onboarding";

describe("normalizeOnboardTracks", () => {
  it("keeps title, uppercased isrc, and mxm id", () => {
    expect(
      normalizeOnboardTracks([
        { title: "Motion Sickness", isrc: "usajaja", mxmTrackId: "998877" },
      ]),
    ).toEqual([
      { title: "Motion Sickness", isrc: "USAJAJA", mxmTrackId: "998877" },
    ]);
  });

  it("trims and nulls a blank or missing isrc / mxm id", () => {
    expect(
      normalizeOnboardTracks([
        { title: "  Kyoto  ", isrc: "  ", mxmTrackId: undefined },
      ]),
    ).toEqual([{ title: "Kyoto", isrc: null, mxmTrackId: null }]);
  });

  it("drops entries with an empty title", () => {
    expect(
      normalizeOnboardTracks([
        { title: "   ", isrc: "USONE" },
        { title: "Real", isrc: "USTWO" },
      ]),
    ).toEqual([{ title: "Real", isrc: "USTWO", mxmTrackId: null }]);
  });

  it("dedupes by isrc, then mxm id, then title — first seen wins", () => {
    expect(
      normalizeOnboardTracks([
        { title: "A", isrc: "USX" },
        { title: "A dup by isrc", isrc: "usx" },
        { title: "B", mxmTrackId: "55" },
        { title: "B dup by mxm", mxmTrackId: "55" },
        { title: "C" },
        { title: "c" },
      ]),
    ).toEqual([
      { title: "A", isrc: "USX", mxmTrackId: null },
      { title: "B", isrc: null, mxmTrackId: "55" },
      { title: "C", isrc: null, mxmTrackId: null },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(normalizeOnboardTracks([])).toEqual([]);
  });
});
