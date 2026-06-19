import { describe, it, expect } from "vitest";
import {
  normalizeAudioUrl,
  extFromFilename,
  isInOpportunityScope,
} from "@/lib/audio-url";

describe("normalizeAudioUrl", () => {
  it("rewrites a Google Drive /file/d/ link to direct download", () => {
    expect(
      normalizeAudioUrl("https://drive.google.com/file/d/ABC123/view?usp=sharing"),
    ).toBe("https://drive.google.com/uc?export=download&id=ABC123");
  });

  it("rewrites a Google Drive open?id= link to direct download", () => {
    expect(
      normalizeAudioUrl("https://drive.google.com/open?id=XYZ789"),
    ).toBe("https://drive.google.com/uc?export=download&id=XYZ789");
  });

  it("forces dl=1 on a Dropbox share link", () => {
    expect(
      normalizeAudioUrl("https://www.dropbox.com/s/abc/track.mp3?dl=0"),
    ).toBe("https://www.dropbox.com/s/abc/track.mp3?dl=1");
  });

  it("adds dl=1 to a Dropbox link with no dl param", () => {
    expect(
      normalizeAudioUrl("https://www.dropbox.com/s/abc/track.mp3"),
    ).toBe("https://www.dropbox.com/s/abc/track.mp3?dl=1");
  });

  it("returns a plain direct file URL unchanged", () => {
    expect(normalizeAudioUrl("https://cdn.example.com/track.mp3")).toBe(
      "https://cdn.example.com/track.mp3",
    );
  });

  it("returns non-URL junk unchanged", () => {
    expect(normalizeAudioUrl("not a url")).toBe("not a url");
  });
});

describe("extFromFilename", () => {
  it("returns the lowercased extension when accepted", () => {
    expect(extFromFilename("My Song.MP3")).toBe("mp3");
    expect(extFromFilename("track.wav")).toBe("wav");
  });

  it("returns null for an unaccepted extension", () => {
    expect(extFromFilename("doc.pdf")).toBeNull();
    expect(extFromFilename("noext")).toBeNull();
  });
});

describe("isInOpportunityScope", () => {
  it("accepts a path under the opportunity id", () => {
    expect(isInOpportunityScope("opp-1", "opp-1/source.mp3")).toBe(true);
  });

  it("rejects a path under a different id", () => {
    expect(isInOpportunityScope("opp-1", "opp-2/source.mp3")).toBe(false);
  });

  it("rejects path traversal", () => {
    expect(isInOpportunityScope("opp-1", "opp-1/../opp-2/source.mp3")).toBe(false);
  });
});
