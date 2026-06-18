/**
 * Normalize the tracks an artist picked during onboarding (from the catalog
 * picker) into clean rows for the `tracks` table: trim titles, uppercase ISRCs,
 * null out blanks, drop title-less entries, and dedupe (by ISRC, then mxm id,
 * then title — first seen wins). The `/api/artists` route re-runs this
 * server-side, so the client use is just a tidy request + preview.
 */
export interface OnboardTrackInput {
  title: string;
  isrc?: string | null;
  mxmTrackId?: string | null;
}

export interface OnboardTrack {
  title: string;
  isrc: string | null;
  mxmTrackId: string | null;
}

export function normalizeOnboardTracks(
  tracks: OnboardTrackInput[],
): OnboardTrack[] {
  const seen = new Set<string>();
  const out: OnboardTrack[] = [];
  for (const t of tracks) {
    const title = t.title?.trim() ?? "";
    if (!title) continue;
    const isrc = t.isrc?.trim().toUpperCase() || null;
    const mxmTrackId = t.mxmTrackId?.trim() || null;
    const key = isrc ?? mxmTrackId ?? `title:${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, isrc, mxmTrackId });
  }
  return out;
}
