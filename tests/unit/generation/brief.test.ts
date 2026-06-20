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

  it("instructs the model on time rules, structure, and why-it-works", () => {
    const prompt = buildBriefPrompt(baseInput).toLowerCase();
    expect(prompt).toContain("time rules");
    expect(prompt).toContain("why it works");
    expect(prompt).toContain("beat");
    expect(prompt).toContain("concept");
    // platform timing rule from the format playbook
    expect(prompt).toContain("first 3 seconds");
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

  it("describes a live-show subject when there is no track", () => {
    const prompt = buildBriefPrompt({
      ...baseInput,
      track: null,
      artistName: "Ed Sheeran",
      hookSnippet: null,
      intelligence: {
        themes: [],
        mood: null,
        language: null,
        bpm: null,
        clipStartMs: null,
        clipEndMs: null,
        visualMood: null,
      },
      opportunity: {
        market: "MX",
        language: null,
        reason: "Upcoming show: Ed Sheeran at Estadio Ciudad de los Deportes",
      },
    });
    expect(prompt).toContain("Ed Sheeran");
    expect(prompt).not.toContain('Track: "');
    expect(prompt).toContain("MX");
  });
});

describe("generateBrief", () => {
  const plan = (name: string) => ({
    concept: `${name} concept`,
    whyItWorks: `${name} works because BR is surging`,
    beats: [
      { time: "0–3s", label: "Hook", action: "open strong" },
      { time: "3–15s", label: "Payoff", action: "deliver the moment" },
    ],
    captions: [`${name} caption a`, `${name} caption b`],
  });
  const fakeCopy = {
    hook: "your city, after midnight",
    angle: "lean into the BR late-night crowd",
    formats: {
      reel: plan("reel"),
      tiktok: plan("tiktok"),
      short: plan("short"),
      lyricVideo: plan("lyric"),
      staticPost: plan("static"),
      carousel: plan("carousel"),
      faceless: plan("faceless"),
    },
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

describe("BriefCopySchema beat constraints", () => {
  const plan = (beats: { time: string; label: string; action: string }[]) => ({
    concept: "c",
    whyItWorks: "w",
    beats,
    captions: ["cap"],
  });
  const copyWithStatic = (
    staticBeats: { time: string; label: string; action: string }[],
  ) => ({
    hook: "h",
    angle: "a",
    formats: {
      reel: plan([
        { time: "0–3s", label: "Hook", action: "open" },
        { time: "3–15s", label: "Payoff", action: "land it" },
      ]),
      tiktok: plan([
        { time: "0–2s", label: "Hook", action: "open" },
        { time: "2–20s", label: "Payoff", action: "land it" },
      ]),
      short: plan([
        { time: "0–2s", label: "Hook", action: "open" },
        { time: "2–40s", label: "Payoff", action: "land it" },
      ]),
      lyricVideo: plan([
        { time: "0–3s", label: "Hook", action: "open" },
        { time: "3–20s", label: "Payoff", action: "land it" },
      ]),
      staticPost: plan(staticBeats),
      carousel: plan([
        { time: "Slide 1", label: "Hook", action: "open" },
        { time: "Slide 5", label: "CTA", action: "close" },
      ]),
      faceless: plan([
        { time: "0–3s", label: "Hook", action: "open" },
        { time: "3–20s", label: "Payoff", action: "land it" },
      ]),
    },
    script: "s",
  });

  // A static post is a single frame — the model legitimately returns one beat.
  // The schema must accept that (regression for the show-signal 502).
  it("accepts a single-frame static post with exactly one beat", () => {
    const result = BriefCopySchema.safeParse(
      copyWithStatic([{ time: "Frame", label: "Hook", action: "the image" }]),
    );
    expect(result.success).toBe(true);
  });

  it("still rejects a format with zero beats", () => {
    const result = BriefCopySchema.safeParse(copyWithStatic([]));
    expect(result.success).toBe(false);
  });
});
