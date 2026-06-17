import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/ai", () => ({ generateStructured: vi.fn() }));

import { generateStructured } from "@/lib/ai";
import {
  buildBriefPrompt,
  generateBrief,
  BriefCopySchema,
  type BriefInput,
} from "@/lib/generation/brief";

const mockGenerate = vi.mocked(generateStructured);

const baseInput: BriefInput = {
  track: { title: "Dark Nights", isrc: "US1234567890" },
  intelligence: {
    themes: ["heartbreak", "night"],
    mood: "melancholic",
    language: "en",
    bpm: 120,
    clipStartMs: 30_000,
    clipEndMs: 45_000,
    visualMood: "cool / muted",
  },
  opportunity: {
    market: "BR",
    language: "pt",
    reason: "streams +80% in BR",
  },
  brandVoice: "intimate, poetic, lowercase",
  hookSnippet: "we were dancing in the dark",
};

beforeEach(() => {
  mockGenerate.mockReset();
});

describe("buildBriefPrompt", () => {
  it("includes the rising market, the format list, the brand voice, and the hook", () => {
    const prompt = buildBriefPrompt(baseInput);
    expect(prompt).toContain("BR");
    expect(prompt).toContain("tiktok");
    expect(prompt).toContain("reel");
    expect(prompt).toContain("intimate, poetic, lowercase");
    expect(prompt).toContain("we were dancing in the dark");
  });

  it("references the clip window and theme/mood angle inputs", () => {
    const prompt = buildBriefPrompt(baseInput);
    expect(prompt).toContain("melancholic");
    expect(prompt).toContain("heartbreak");
    // clip window seconds (30s–45s)
    expect(prompt).toMatch(/30(\.0)?s/);
  });

  it("rejects a hook of 15+ words via the compliance guard", () => {
    const longHook = Array(15).fill("x").join(" ");
    expect(() =>
      buildBriefPrompt({ ...baseInput, hookSnippet: longHook }),
    ).toThrow(/15/);
  });

  it("works without a hook snippet (omits the hook line)", () => {
    const prompt = buildBriefPrompt({ ...baseInput, hookSnippet: null });
    expect(prompt).toContain("BR");
    expect(prompt).not.toContain("we were dancing in the dark");
  });
});

describe("generateBrief", () => {
  const fakeCopy = {
    hook: "your city, after midnight",
    angle: "lean into the BR late-night crowd",
    formats: {
      reel: "reel copy",
      tiktok: "tiktok copy",
      short: "short copy",
      lyricVideo: "lyric video copy",
      staticPost: "static post copy",
      carousel: "carousel copy",
      faceless: "faceless copy",
    },
    captions: ["caption a", "caption b"],
    script: "voiceover script",
  };

  it("calls the model with the brief schema + built prompt and returns the copy", async () => {
    mockGenerate.mockResolvedValue(fakeCopy);

    const result = await generateBrief(baseInput);

    expect(mockGenerate).toHaveBeenCalledOnce();
    const arg = mockGenerate.mock.calls[0][0];
    expect(arg.schema).toBe(BriefCopySchema);
    expect(arg.prompt).toContain("BR");
    expect(result).toEqual(fakeCopy);
  });
});
