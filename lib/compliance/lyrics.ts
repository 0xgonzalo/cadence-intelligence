export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Lyric-derived snippets may be DISPLAYED only if < 15 words. Never persist raw lyrics. */
export function assertSnippetAllowed(snippet: string): string {
  if (wordCount(snippet) >= 15) {
    throw new Error("Compliance: lyric snippet must be < 15 words");
  }
  return snippet;
}
