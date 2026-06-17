/**
 * Collab ranking heuristic.
 *
 * Scores creator candidates for an opportunity by how well they fit the
 * artist: market overlap with the artist's real audience geography (Songstats),
 * the creator's reach, and a fit/affinity signal. Pure + deterministic so it
 * unit-tests without any I/O — the endpoint feeds it candidates built only from
 * real partner data (never fabricated).
 */

export interface CreatorCandidate {
  handle: string;
  /** ISO market codes the creator reaches (e.g. ["BR"]). */
  markets: string[];
  reach: number;
  /** Affinity 0..1 (theme/values match, similarity signal). */
  fit: number;
  source?: string;
  rationale?: string;
}

export interface RankOptions {
  /** The artist's priority markets (top audience geography). */
  artistMarkets: string[];
}

export interface RankedCreator extends CreatorCandidate {
  /** Combined 0..1 score used for ordering. */
  score: number;
}

const W_MARKET = 0.4;
const W_FIT = 0.35;
const W_REACH = 0.25;

/** Fraction of a candidate's markets that hit the artist's priority markets. */
function marketOverlap(markets: string[], artistMarkets: Set<string>): number {
  if (markets.length === 0 || artistMarkets.size === 0) return 0;
  const hits = markets.filter((m) => artistMarkets.has(m)).length;
  return hits / markets.length;
}

/**
 * Rank creators best-fit first. Score blends market overlap, fit, and
 * reach (normalized against the strongest candidate); ties break on raw reach.
 */
export function rankCreators(
  candidates: CreatorCandidate[],
  { artistMarkets }: RankOptions,
): RankedCreator[] {
  if (candidates.length === 0) return [];

  const markets = new Set(artistMarkets.map((m) => m.toUpperCase()));
  const maxReach = Math.max(
    1,
    ...candidates.map((c) => (Number.isFinite(c.reach) ? c.reach : 0)),
  );

  return candidates
    .map((c) => {
      const overlap = marketOverlap(
        c.markets.map((m) => m.toUpperCase()),
        markets,
      );
      const fit = Math.min(1, Math.max(0, c.fit));
      const reachNorm = (Number.isFinite(c.reach) ? c.reach : 0) / maxReach;
      const score = W_MARKET * overlap + W_FIT * fit + W_REACH * reachNorm;
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score || b.reach - a.reach);
}
