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
  // A 404 means the ISRC isn't in Songstats' index yet — their API returns
  // {result:"error", message:"Track not found…"} and kicks off async ingestion.
  // For freshly-onboarded catalog that's an expected "no data yet" state, not a
  // failure, so return null and let callers degrade to empty instead of throwing.
  if (res.status === 404) return null;
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
  if (json === null) return [];
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
  if (json === null) return [];
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

const ActivityRowSchema = z
  .object({
    source: z.string().optional(),
    activity_text: z.string().optional(),
    activity_type: z.string().optional(),
    activity_date: z.string().optional(),
    activity_tier: z.coerce.number().optional(),
  })
  .passthrough();

const ActivitiesEnvelopeSchema = z
  .object({
    activities: z.array(ActivityRowSchema).optional(),
    data: z.array(ActivityRowSchema).optional(),
  })
  .passthrough();

export interface TikTokCreator {
  handle: string;
  market: string | null;
  reach: number | null;
}

/** Parse "103K"/"1.2M"/"2401" follower counts into an absolute number. */
function parseFollowerCount(raw: string): number | null {
  const m = raw.trim().match(/^([\d.,]+)\s*([KMB]?)$/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const mult =
    { "": 1, K: 1e3, M: 1e6, B: 1e9 }[m[2].toUpperCase()] ?? 1;
  return Math.round(n * mult);
}

/**
 * Extract a creator from a TikTok activity line. The activities endpoint never
 * exposes the real @username (its `activity_url` is anonymized), so the only
 * identity available is the display name in `activity_text`, formatted as
 * "New video by {name} ({followers} Followers)".
 */
function parseCreatorActivity(
  text: string,
): { handle: string; reach: number | null } | null {
  const m = text.match(/by\s+(.+?)\s*\(([\d.,]+\s*[KMB]?)\s+Followers?\)/i);
  if (!m) return null;
  const handle = m[1].trim();
  if (!handle) return null;
  return { handle, reach: parseFollowerCount(m[2]) };
}

/**
 * Real TikTok creators driving UGC for a track (used by the collab radar).
 * Sourced from `/tracks/activities` (verified live): `/tracks/stats` only
 * returns aggregate counts, never individual creators. Creator identity is the
 * display name parsed from each video activity — Songstats anonymizes the real
 * @handle/profile URL. Returns one entry per creator (deduped, highest reach).
 */
export async function getTikTokCreators(isrc: string): Promise<TikTokCreator[]> {
  const json = await songstatsGet("/tracks/activities", {
    isrc,
    source: "tiktok",
  });
  if (json === null) return [];
  const parsed = ActivitiesEnvelopeSchema.parse(json);
  const rows = parsed.activities ?? parsed.data ?? [];

  const byHandle = new Map<string, TikTokCreator>();
  for (const row of rows) {
    if (row.activity_type && row.activity_type !== "video") continue;
    if (!row.activity_text) continue;
    const creator = parseCreatorActivity(row.activity_text);
    if (!creator) continue;
    const existing = byHandle.get(creator.handle);
    if (!existing || (creator.reach ?? 0) > (existing.reach ?? 0)) {
      byHandle.set(creator.handle, {
        handle: creator.handle,
        market: null,
        reach: creator.reach,
      });
    }
  }
  return [...byHandle.values()];
}
