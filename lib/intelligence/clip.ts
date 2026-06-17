/**
 * Clip-window detection: given a track's energy curve and total duration, find
 * the contiguous window of highest sustained energy — the natural "hook" to cut
 * a short-form clip around. Output is real track milliseconds, stored as
 * `track_intelligence.clip_start_ms` / `clip_end_ms` and used in Phase 4.
 */

export interface ClipWindow {
  startMs: number;
  endMs: number;
}

/** Default short-form clip length when the caller doesn't specify one. */
export const DEFAULT_CLIP_MS = 15_000;

/**
 * Pick the highest-energy window of `clipMs` within a track of `totalMs`,
 * sampled by `energyCurve` (evenly spaced, any length/units — only relative
 * magnitude matters). Returns the `{startMs, endMs}` of the window maximizing
 * summed energy. Clamps to the whole track when the clip is longer than the
 * track, and returns a zero window for an empty curve.
 */
export function pickClipWindow(
  energyCurve: number[],
  totalMs: number,
  clipMs: number = DEFAULT_CLIP_MS,
): ClipWindow {
  const n = energyCurve.length;
  if (n === 0 || totalMs <= 0) return { startMs: 0, endMs: 0 };

  const sampleMs = totalMs / n;
  const win = Math.max(1, Math.round(clipMs / sampleMs));
  if (win >= n) return { startMs: 0, endMs: Math.round(totalMs) };

  // Sliding window of `win` samples; track the start index of the max sum.
  let bestStart = 0;
  let bestSum = -Infinity;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += energyCurve[i];
    if (i >= win) sum -= energyCurve[i - win];
    if (i >= win - 1 && sum > bestSum) {
      bestSum = sum;
      bestStart = i - win + 1;
    }
  }

  return {
    startMs: Math.round(bestStart * sampleMs),
    endMs: Math.min(Math.round((bestStart + win) * sampleMs), Math.round(totalMs)),
  };
}
