/**
 * Songstats Enterprise API adapter — derived public metrics only (no lyrics).
 *
 * Base/auth are from the Songstats Enterprise v1 docs
 * (https://api.songstats.com/enterprise/v1, `apikey` header). The exact
 * response *shapes* below are documentation-derived and have NOT been confirmed
 * against a live call (no SONGSTATS_API_KEY was available at build time).
 * Schemas are intentionally loose (`.passthrough()`, optional envelopes) so a
 * real response won't throw on shape drift; run a live smoke call and tighten
 * the field mapping once the key is set. See Task 1.3 in the plan.
 */
import { z } from "zod";
import { fetchWithTimeout } from "@/lib/http";
import type { MomentumSignal } from "@/lib/domain/types";

const BASE_URL = "https://api.songstats.com/enterprise/v1";

function requireApiKey(): string {
  const key = process.env.SONGSTATS_API_KEY;
  if (!key) throw new Error("SONGSTATS_API_KEY is not set");
  return key;
}

async function songstatsGet(
  path: string,
  params: Record<string, string>,
): Promise<unknown> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetchWithTimeout(url.toString(), {
    headers: { apikey: requireApiKey(), accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Songstats ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// --- /tracks/stats ---------------------------------------------------------

const StatSourceSchema = z
  .object({
    source: z.string(),
    data: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();

const StatsEnvelopeSchema = z
  .object({
    result: z.string().optional(),
    stats: z.array(StatSourceSchema).optional(),
    data: z.array(StatSourceSchema).optional(),
  })
  .passthrough();

/**
 * Current cross-platform metrics for a track, flattened into point-in-time
 * MomentumSignals (market = "global"; per-market data comes from the audience
 * endpoint). The caller stores these as `track_signals` rows; momentum compares
 * the latest two captures over time.
 */
export async function getTrackStats(isrc: string): Promise<MomentumSignal[]> {
  const json = await songstatsGet("/tracks/stats", { isrc });
  const parsed = StatsEnvelopeSchema.parse(json);
  const sources = parsed.stats ?? parsed.data ?? [];
  const capturedAt = new Date().toISOString();

  const signals: MomentumSignal[] = [];
  for (const { source, data } of sources) {
    for (const [metric, raw] of Object.entries(data)) {
      const value = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(value)) continue;
      signals.push({
        trackId: isrc,
        source,
        metric,
        value,
        market: "global",
        capturedAt,
      });
    }
  }
  return signals;
}

// --- /tracks/audience ------------------------------------------------------

const AudienceRowSchema = z
  .object({
    country_code: z.string().optional(),
    country: z.string().optional(),
    value: z.coerce.number().optional(),
  })
  .passthrough();

const AudienceEnvelopeSchema = z
  .object({
    audience: z.array(AudienceRowSchema).optional(),
    data: z
      .union([
        z.array(AudienceRowSchema),
        z.object({ audience: z.array(AudienceRowSchema).optional() }).passthrough(),
      ])
      .optional(),
  })
  .passthrough();

export interface AudienceMarket {
  market: string;
  value: number;
}

/** Top listener markets (ISO country codes) for a track, sorted by reach desc. */
export async function getTrackAudienceMarkets(
  isrc: string,
): Promise<AudienceMarket[]> {
  const json = await songstatsGet("/tracks/audience", { isrc });
  const parsed = AudienceEnvelopeSchema.parse(json);
  const rows =
    parsed.audience ??
    (Array.isArray(parsed.data) ? parsed.data : parsed.data?.audience) ??
    [];

  return rows
    .map((r) => ({
      market: (r.country_code ?? r.country ?? "").toUpperCase(),
      value: r.value ?? 0,
    }))
    .filter((m) => m.market)
    .sort((a, b) => b.value - a.value);
}

// --- TikTok / UGC creators -------------------------------------------------

const CreatorRowSchema = z
  .object({
    handle: z.string().optional(),
    username: z.string().optional(),
    market: z.string().optional(),
    country_code: z.string().optional(),
    reach: z.coerce.number().optional(),
    followers: z.coerce.number().optional(),
  })
  .passthrough();

const CreatorsEnvelopeSchema = z
  .object({
    data: z.array(CreatorRowSchema).optional(),
    creators: z.array(CreatorRowSchema).optional(),
  })
  .passthrough();

export interface TikTokCreator {
  handle: string;
  market: string | null;
  reach: number | null;
}

/**
 * Top TikTok creators driving UGC for a track (used by the Phase-5 collab
 * radar). Endpoint/response shape is the least-certain of the three — confirm
 * the exact path (`/tracks/...`) against a live call before relying on it.
 */
export async function getTikTokCreators(isrc: string): Promise<TikTokCreator[]> {
  const json = await songstatsGet("/tracks/stats", {
    isrc,
    source: "tiktok",
    with_creators: "true",
  });
  const parsed = CreatorsEnvelopeSchema.parse(json);
  const rows = parsed.creators ?? parsed.data ?? [];

  return rows
    .map((r) => ({
      handle: r.handle ?? r.username ?? "",
      market: (r.market ?? r.country_code ?? null)?.toUpperCase() ?? null,
      reach: r.reach ?? r.followers ?? null,
    }))
    .filter((c) => c.handle);
}
