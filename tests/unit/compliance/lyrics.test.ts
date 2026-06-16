import { describe, it, expect } from "vitest";
import { assertSnippetAllowed, wordCount } from "@/lib/compliance/lyrics";

describe("lyric compliance", () => {
  it("counts words", () => expect(wordCount("one two three")).toBe(3));
  it("allows snippets under 15 words", () =>
    expect(() => assertSnippetAllowed("a b c d e")).not.toThrow());
  it("rejects 15+ word snippets", () =>
    expect(() => assertSnippetAllowed(Array(15).fill("x").join(" "))).toThrow(/15/));
});
