/**
 * Cyanite adapter — audio analysis (bpm / mood / genre / energy curve) and
 * track similarity for the Phase-5 collab radar. Cyanite is a GraphQL API
 * (https://api.cyanite.ai/graphql, `Authorization: Bearer <CYANITE_API_KEY>`).
 *
 * Queries and response *shapes* are documentation-derived and have NOT been
 * confirmed against a live call (no CYANITE_API_KEY was available at build
 * time). Parsing is intentionally defensive (`safeParse`, optional fields,
 * fallbacks) so a real response won't throw on shape drift; run a live smoke
 * call and tighten the field selection/mapping once the key is set. A track
 * must already exist in the Cyanite library — `analyzeTrack`/`similarTracks`
 * take that library track id. See Task 2.2 in the plan.
 */
import { z } from "zod";
import { fetchWithTimeout } from "@/lib/http";

const BASE_URL = "https://api.cyanite.ai/graphql";

function requireApiKey(): string {
  const key = process.env.CYANITE_API_KEY;
  if (!key) throw new Error("CYANITE_API_KEY is not set");
  return key;
}

const GqlEnvelopeSchema = z
  .object({
    data: z.unknown().optional(),
    errors: z
      .array(z.object({ message: z.string() }).passthrough())
      .optional(),
  })
  .passthrough();

async function cyaniteQuery(
  query: string,
  variables: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetchWithTimeout(BASE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${requireApiKey()}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Cyanite request failed: ${res.status} ${res.statusText}`);
  }
  const env = GqlEnvelopeSchema.parse(await res.json());
  if (env.errors?.length) {
    throw new Error(
      `Cyanite GraphQL error: ${env.errors.map((e) => e.message).join("; ")}`,
    );
  }
  return env.data;
}

// --- analyzeTrack ----------------------------------------------------------

const ANALYZE_QUERY = `query AnalyzeTrack($id: ID!) {
  libraryTrack(id: $id) {
    __typename
    ... on LibraryTrack {
      id
      audioAnalysisV6 {
        __typename
        ... on AudioAnalysisV6Finished {
          result {
            bpm
            genreTags
            moodTags
            energyDynamics
          }
        }
      }
    }
  }
}`;

const AnalysisDataSchema = z
  .object({
    libraryTrack: z
      .object({
        audioAnalysisV6: z
          .object({
            result: z
              .object({
                bpm: z.coerce.number().optional(),
                genreTags: z.array(z.string()).optional(),
                moodTags: z.array(z.string()).optional(),
                energyDynamics: z.array(z.coerce.number()).optional(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export interface CyaniteAnalysis {
  bpm: number | null;
  mood: string | null;
  genre: string | null;
  /** Relative energy over time; mapped to a clip window by `pickClipWindow`. */
  energyCurve: number[];
}

/**
 * Derived audio analysis for a Cyanite library track: bpm, the top mood and
 * genre tag, and an energy-over-time curve. Missing fields degrade to
 * null/empty rather than throwing.
 */
export async function analyzeTrack(trackId: string): Promise<CyaniteAnalysis> {
  const data = await cyaniteQuery(ANALYZE_QUERY, { id: trackId });
  const parsed = AnalysisDataSchema.safeParse(data);
  const result = parsed.success
    ? parsed.data.libraryTrack?.audioAnalysisV6?.result
    : undefined;

  return {
    bpm: result?.bpm ?? null,
    mood: result?.moodTags?.[0] ?? null,
    genre: result?.genreTags?.[0] ?? null,
    energyCurve: result?.energyDynamics ?? [],
  };
}

// --- similarTracks ---------------------------------------------------------

const SIMILAR_QUERY = `query SimilarTracks($id: ID!) {
  libraryTrack(id: $id) {
    __typename
    ... on LibraryTrack {
      similarTracks(first: 20) {
        edges {
          cosineSimilarity
          node { id }
        }
      }
    }
  }
}`;

const SimilarDataSchema = z
  .object({
    libraryTrack: z
      .object({
        similarTracks: z
          .object({
            edges: z
              .array(
                z
                  .object({
                    cosineSimilarity: z.coerce.number().optional(),
                    score: z.coerce.number().optional(),
                    node: z
                      .object({ id: z.union([z.string(), z.number()]) })
                      .passthrough(),
                  })
                  .passthrough(),
              )
              .default([]),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export interface SimilarTrack {
  id: string;
  score: number | null;
}

/**
 * Tracks acoustically similar to `trackId`, sorted by Cyanite's similarity
 * score (used by the Phase-5 collab radar). Returns `[]` when none are found.
 */
export async function similarTracks(trackId: string): Promise<SimilarTrack[]> {
  const data = await cyaniteQuery(SIMILAR_QUERY, { id: trackId });
  const parsed = SimilarDataSchema.safeParse(data);
  if (!parsed.success) return [];

  const edges = parsed.data.libraryTrack?.similarTracks?.edges ?? [];
  return edges.map((e) => ({
    id: String(e.node.id),
    score: e.cosineSimilarity ?? e.score ?? null,
  }));
}
