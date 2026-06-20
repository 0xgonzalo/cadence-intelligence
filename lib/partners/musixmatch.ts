/**
 * Musixmatch adapter — the intelligence core of CADENCE.
 *
 * COMPLIANCE (HARD RULE): this module returns derived labels (themes / mood /
 * language) and EPHEMERAL, display-only snippets. It never returns a full lyric
 * body for persistence, and callers MUST NOT write any value produced by
 * `getHookSnippet` or `getRichsync` to the database — those are fetched live and
 * used in-flight only. Hook snippets are forced through `assertSnippetAllowed`
 * (< 15 words) before they leave this module.
 *
 * Base/auth follow the Musixmatch API (https://api.musixmatch.com/ws/1.1,
 * `apikey` query param, `message`-envelope responses). Endpoint paths and
 * response *shapes* are documentation-derived and have NOT been confirmed
 * against a live call (no MUSIXMATCH_API_KEY was available at build time).
 * Schemas are intentionally loose (`.passthrough()`, optional, `safeParse`) so a
 * real response won't throw on shape drift; run a live smoke call and tighten
 * the field mapping once the key is set. See Task 2.1 in the plan.
 */
import { z } from "zod";
import { fetchWithTimeout } from "@/lib/http";
import { assertSnippetAllowed } from "@/lib/compliance/lyrics";

const BASE_URL = "https://api.musixmatch.com/ws/1.1";

function requireApiKey(): string {
  const key = process.env.MUSIXMATCH_API_KEY;
  if (!key) throw new Error("MUSIXMATCH_API_KEY is not set");
  return key;
}

const EnvelopeSchema = z
  .object({
    message: z
      .object({
        header: z.object({ status_code: z.coerce.number().optional() }).passthrough(),
        // body is `""` (empty string) when Musixmatch finds nothing.
        body: z.unknown(),
      })
      .passthrough(),
  })
  .passthrough();

/**
 * GET a Musixmatch endpoint and return its `message.body`. Throws on transport
 * failure or a non-2xx Musixmatch `status_code` so adapters fail loudly.
 */
async function mxmGet(
  path: string,
  params: Record<string, string>,
): Promise<unknown> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("apikey", requireApiKey());
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetchWithTimeout(url.toString(), {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Musixmatch ${path} failed: ${res.status} ${res.statusText}`);
  }
  const env = EnvelopeSchema.parse(await res.json());
  const status = env.message.header.status_code;
  // Musixmatch uses 404 to mean "no match / not found" — surface that as an
  // empty body so callers degrade to null/[] instead of throwing.
  if (status !== undefined && status >= 400 && status !== 404) {
    throw new Error(`Musixmatch ${path} status ${status}`);
  }
  return env.message.body;
}

// --- matcher.track.get -----------------------------------------------------

export interface TrackQuery {
  isrc?: string;
  title?: string;
  artist?: string;
}

const MatcherBodySchema = z
  .object({
    track: z
      .object({ track_id: z.union([z.number(), z.string()]) })
      .passthrough(),
  })
  .passthrough();

/**
 * Resolve a Musixmatch `track_id` from an ISRC (preferred) or a title+artist
 * pair. Returns `null` when Musixmatch can't match the query.
 */
export async function matchTrack(q: TrackQuery): Promise<string | null> {
  const params: Record<string, string> = {};
  if (q.isrc) params.track_isrc = q.isrc;
  if (q.title) params.q_track = q.title;
  if (q.artist) params.q_artist = q.artist;
  if (!q.isrc && !(q.title && q.artist)) {
    throw new Error("matchTrack requires an isrc or a title+artist pair");
  }

  const body = await mxmGet("/matcher.track.get", params);
  const parsed = MatcherBodySchema.safeParse(body);
  if (!parsed.success) return null;
  return String(parsed.data.track.track_id);
}

// --- artist.search → onboarding artist picker ------------------------------

const ArtistSearchBodySchema = z
  .object({
    artist_list: z
      .array(
        z
          .object({
            artist: z
              .object({
                artist_id: z.union([z.number(), z.string()]),
                artist_name: z.string(),
                artist_country: z.string().optional(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

export interface ArtistSearchResult {
  artistId: string;
  name: string;
  country: string | null;
}

/**
 * Search Musixmatch for artists by name — the onboarding artist picker. Returns
 * [] when nothing matches (Musixmatch answers an unmatched search with 404).
 */
export async function searchArtists(
  query: string,
): Promise<ArtistSearchResult[]> {
  const body = await mxmGet("/artist.search", {
    q_artist: query,
    page_size: "8",
  });
  const parsed = ArtistSearchBodySchema.safeParse(body);
  if (!parsed.success) return [];
  return parsed.data.artist_list.map(({ artist }) => ({
    artistId: String(artist.artist_id),
    name: artist.artist_name,
    country: artist.artist_country ?? null,
  }));
}

/**
 * Same-named artists are common, and Musixmatch `artist.search` carries no
 * image or popularity to tell them apart. The reliable signal is each artist's
 * own top tracks, so this enriches every candidate with its biggest song titles
 * (resolved by `artist_id`, so they always map to the right act). Track lookups
 * run in parallel and degrade to `[]` per-artist, so one flaky lookup never
 * fails the whole search.
 */
export interface ArtistCandidate extends ArtistSearchResult {
  topTracks: string[];
}

export async function searchArtistCandidates(
  query: string,
  tracksPerArtist = 3,
): Promise<ArtistCandidate[]> {
  const artists = await searchArtists(query);
  return Promise.all(
    artists.map(async (artist) => {
      let topTracks: string[] = [];
      try {
        const tracks = await getArtistTracks(artist.artistId, tracksPerArtist);
        topTracks = tracks.map((t) => t.title);
      } catch {
        topTracks = [];
      }
      return { ...artist, topTracks };
    }),
  );
}

// --- track.search → artist catalog -----------------------------------------

const ArtistTracksBodySchema = z
  .object({
    track_list: z
      .array(
        z
          .object({
            track: z
              .object({
                track_id: z.union([z.number(), z.string()]),
                track_name: z.string(),
                track_isrc: z.string().optional(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

export interface ArtistTrack {
  mxmTrackId: string;
  title: string;
  isrc: string | null;
}

/**
 * Top tracks for a Musixmatch artist id, highest-rated first — the candidate
 * songs an artist picks during onboarding. `isrc` is null when Musixmatch
 * doesn't expose one for a track. Returns [] when the artist has no tracks.
 */
export async function getArtistTracks(
  artistId: string,
  limit = 3,
): Promise<ArtistTrack[]> {
  const body = await mxmGet("/track.search", {
    f_artist_id: artistId,
    s_track_rating: "desc",
    page_size: String(limit),
  });
  const parsed = ArtistTracksBodySchema.safeParse(body);
  if (!parsed.success) return [];
  return parsed.data.track_list.map(({ track }) => ({
    mxmTrackId: String(track.track_id),
    title: track.track_name,
    isrc: track.track_isrc ? track.track_isrc.toUpperCase() : null,
  }));
}

// --- track.get → derived analysis -----------------------------------------

const TrackBodySchema = z
  .object({
    track: z
      .object({
        primary_genres: z
          .object({
            music_genre_list: z
              .array(
                z
                  .object({
                    music_genre: z
                      .object({ music_genre_name: z.string() })
                      .passthrough(),
                  })
                  .passthrough(),
              )
              .default([]),
          })
          .optional(),
        // Pro analysis fields (confirm against a live call):
        themes: z.array(z.string()).optional(),
        mood: z.string().optional(),
        language: z.string().optional(),
        lyrics_language: z.string().optional(),
        // track.get returns the ISRC even when track.search omitted it.
        track_isrc: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export interface TrackAnalysis {
  themes: string[];
  mood: string | null;
  language: string | null;
  /** Recovered from track.get — lets Songstats/Cyanite key tracks onboarded without one. */
  isrc: string | null;
}

/**
 * Derived, persist-safe labels for a track: lyrical/sonic themes, mood and
 * language. `themes` falls back to the track's genres when the Pro analysis
 * doesn't return explicit themes. No lyric text is returned or stored.
 */
export async function getAnalysis(mxmTrackId: string): Promise<TrackAnalysis> {
  const body = await mxmGet("/track.get", { track_id: mxmTrackId });
  const { track } = TrackBodySchema.parse(body);

  const genreThemes = (track.primary_genres?.music_genre_list ?? []).map(
    (g) => g.music_genre.music_genre_name,
  );

  return {
    themes: track.themes ?? genreThemes,
    mood: track.mood ?? null,
    language: track.language ?? track.lyrics_language ?? null,
    isrc: track.track_isrc ? track.track_isrc.toUpperCase() : null,
  };
}

// --- track.snippet.get → ephemeral hook ------------------------------------

const SnippetBodySchema = z
  .object({
    snippet: z
      .object({ snippet_body: z.string().default("") })
      .passthrough(),
  })
  .passthrough();

/**
 * Live, display-only hook line for a track. The result is capped to < 15 words
 * and run through `assertSnippetAllowed` so it is always compliant to show; it
 * must never be persisted.
 */
export async function getHookSnippet(mxmTrackId: string): Promise<string> {
  const body = await mxmGet("/track.snippet.get", { track_id: mxmTrackId });
  const parsed = SnippetBodySchema.safeParse(body);
  const raw = parsed.success ? parsed.data.snippet.snippet_body : "";

  // Defensive: cap to fewer than 15 words so the displayed hook is compliant
  // even if the upstream snippet is unexpectedly long.
  const capped = raw.trim().split(/\s+/).filter(Boolean).slice(0, 14).join(" ");
  return assertSnippetAllowed(capped);
}

// --- track.richsync.get → live word/line timing ----------------------------

export interface RichsyncLine {
  /** Line start time, seconds. */
  start: number;
  /** Line end time, seconds. */
  end: number;
  /** Line text — LIVE use only (e.g. an on-the-fly lyric clip); never persist. */
  text: string;
}

const RichsyncBodySchema = z
  .object({
    richsync: z
      .object({ richsync_body: z.string().default("[]") })
      .passthrough(),
  })
  .passthrough();

const RichsyncLineRawSchema = z
  .object({ ts: z.number(), te: z.number(), x: z.string() })
  .passthrough();

/**
 * Word/line-level timing for a track, parsed from Musixmatch richsync. Returned
 * for LIVE, ephemeral use (Phase 4 lyric clips) — the caller must never write
 * the `text` to storage. Returns `[]` when no richsync is available.
 */
export async function getRichsync(mxmTrackId: string): Promise<RichsyncLine[]> {
  const body = await mxmGet("/track.richsync.get", { track_id: mxmTrackId });
  const parsed = RichsyncBodySchema.safeParse(body);
  if (!parsed.success) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(parsed.data.richsync.richsync_body);
  } catch {
    return [];
  }

  const lines = z.array(RichsyncLineRawSchema).safeParse(raw);
  if (!lines.success) return [];
  return lines.data.map((l) => ({ start: l.ts, end: l.te, text: l.x }));
}
