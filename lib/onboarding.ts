/**
 * Parse the free-text ISRC field from the onboarding form into a clean list:
 * accepts newline- and/or comma-separated entries, normalizes to uppercase,
 * drops blanks, and dedupes (first-seen order). The `/api/artists` route
 * re-normalizes server-side, so this is purely for a tidy request + preview.
 */
export function parseIsrcs(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of raw.split(/[\n,]/)) {
    const isrc = token.trim().toUpperCase();
    if (!isrc || seen.has(isrc)) continue;
    seen.add(isrc);
    out.push(isrc);
  }
  return out;
}
