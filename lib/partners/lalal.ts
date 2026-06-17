/**
 * LALAL.AI adapter — stem separation (instrumental / acapella / drums / …).
 *
 * LALAL is an async job API following an upload → split → check flow
 * (base `https://www.lalal.ai/api/`, `Authorization: license <LALAL_API_KEY>`).
 * Endpoint paths and response *shapes* are documentation-derived and have NOT
 * been confirmed against a live call (no LALAL_API_KEY was available at build
 * time). Parsing is intentionally defensive (`safeParse`, optional fields) so a
 * real response won't throw on shape drift; run a live smoke call and tighten
 * the mapping once the key is set.
 *
 * The long-running split is handled by polling `checkSplit` until a terminal
 * state (the mw3-club polling pattern) — see `pollSplit` and Task 4.1 in the plan.
 */
import { z } from "zod";
import { fetchWithTimeout, safeFetch } from "@/lib/http";

const BASE_URL = "https://www.lalal.ai/api";

/**
 * A LALAL stem to extract. Splitting `vocals` yields the acapella as the stem
 * track and the instrumental as the complementary back track.
 */
export type Stem =
  | "vocals"
  | "voice"
  | "drum"
  | "bass"
  | "piano"
  | "electric_guitar"
  | "acoustic_guitar"
  | "synthesizer"
  | "strings"
  | "wind";

function requireApiKey(): string {
  const key = process.env.LALAL_API_KEY;
  if (!key) throw new Error("LALAL_API_KEY is not set");
  return key;
}

function authHeader(): Record<string, string> {
  return { Authorization: `license ${requireApiKey()}` };
}

// --- uploadAudio -----------------------------------------------------------

const UploadResponseSchema = z
  .object({
    status: z.string().optional(),
    id: z.string().optional(),
    error: z.string().optional(),
  })
  .passthrough();

async function toBytes(file: ArrayBuffer | Uint8Array | string): Promise<ArrayBuffer> {
  if (typeof file === "string") {
    // User-supplied URL → SSRF-guarded fetch (https-only, no private targets).
    const res = await safeFetch(file, {}, 20_000);
    if (!res.ok) {
      throw new Error(`LALAL could not fetch audio: ${res.status} ${res.statusText}`);
    }
    return res.arrayBuffer();
  }
  return file instanceof Uint8Array
    ? (file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer)
    : file;
}

/**
 * Upload audio (raw bytes or a remote URL whose bytes are fetched first) and
 * return LALAL's file id. Throws when LALAL rejects the upload.
 */
export async function uploadAudio(
  file: ArrayBuffer | Uint8Array | string,
  filename = "audio.wav",
): Promise<string> {
  const bytes = await toBytes(file);
  const res = await fetchWithTimeout(
    `${BASE_URL}/upload/`,
    {
      method: "POST",
      headers: {
        ...authHeader(),
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
      body: bytes,
    },
    30_000,
  );
  if (!res.ok) {
    throw new Error(`LALAL upload failed: ${res.status} ${res.statusText}`);
  }
  const parsed = UploadResponseSchema.parse(await res.json());
  if (parsed.status !== "success" || !parsed.id) {
    throw new Error(`LALAL upload error: ${parsed.error ?? "unknown"}`);
  }
  return parsed.id;
}

// --- requestSplit ----------------------------------------------------------

const SplitResponseSchema = z
  .object({ status: z.string().optional(), error: z.string().optional() })
  .passthrough();

/**
 * Queue a stem split for an uploaded file. `splitter` defaults to LALAL's
 * highest-quality model ("phoenix"). The job runs async — poll `checkSplit`.
 */
export async function requestSplit(
  id: string,
  stem: Stem,
  splitter = "phoenix",
): Promise<void> {
  const params = JSON.stringify([{ id, stem, splitter }]);
  const body = new URLSearchParams({ params });
  const res = await fetchWithTimeout(`${BASE_URL}/split/`, {
    method: "POST",
    headers: {
      ...authHeader(),
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`LALAL split failed: ${res.status} ${res.statusText}`);
  }
  const parsed = SplitResponseSchema.parse(await res.json());
  if (parsed.status === "error") {
    throw new Error(`LALAL split error: ${parsed.error ?? "unknown"}`);
  }
}

// --- checkSplit ------------------------------------------------------------

export type SplitState = "queued" | "progress" | "success" | "error" | "cancelled";

export interface SplitStatus {
  state: SplitState;
  /** URL of the requested stem (e.g. acapella when splitting `vocals`). */
  stemUrl: string | null;
  /** URL of the complementary track (e.g. the instrumental). */
  backUrl: string | null;
  error?: string | null;
}

const CheckResponseSchema = z
  .object({
    status: z.string().optional(),
    result: z
      .record(
        z.string(),
        z
          .object({
            task: z
              .object({
                state: z.string().optional(),
                error: z.string().nullish(),
              })
              .passthrough()
              .optional(),
            split: z
              .object({
                stem_track: z.string().nullish(),
                back_track: z.string().nullish(),
              })
              .passthrough()
              .nullish(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const TERMINAL: ReadonlySet<SplitState> = new Set([
  "success",
  "error",
  "cancelled",
]);

function normalizeState(raw: string | undefined): SplitState {
  switch (raw) {
    case "success":
    case "progress":
    case "error":
    case "cancelled":
      return raw;
    default:
      return "queued";
  }
}

/** Current status of a split job, including result urls once it succeeds. */
export async function checkSplit(id: string): Promise<SplitStatus> {
  const body = new URLSearchParams({ id });
  const res = await fetchWithTimeout(`${BASE_URL}/check/`, {
    method: "POST",
    headers: {
      ...authHeader(),
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`LALAL check failed: ${res.status} ${res.statusText}`);
  }
  const parsed = CheckResponseSchema.safeParse(await res.json());
  const entry = parsed.success ? parsed.data.result?.[id] : undefined;

  return {
    state: normalizeState(entry?.task?.state),
    stemUrl: entry?.split?.stem_track ?? null,
    backUrl: entry?.split?.back_track ?? null,
    error: entry?.task?.error ?? null,
  };
}

// --- pollSplit -------------------------------------------------------------

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface PollOptions {
  intervalMs?: number;
  maxAttempts?: number;
  /** Injectable delay (tests pass a no-op); defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Poll `checkSplit` until the job reaches a terminal state. Throws on `error`
 * state or when `maxAttempts` is exhausted. Returns the finished status (the
 * caller reads `stemUrl` / `backUrl`).
 */
export async function pollSplit(
  id: string,
  { intervalMs = 3000, maxAttempts = 40, sleep = defaultSleep }: PollOptions = {},
): Promise<SplitStatus> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await checkSplit(id);
    if (TERMINAL.has(status.state)) {
      if (status.state === "error") {
        throw new Error(`LALAL split errored: ${status.error ?? "unknown"}`);
      }
      return status;
    }
    if (attempt < maxAttempts - 1) await sleep(intervalMs);
  }
  throw new Error(`LALAL split timed out after ${maxAttempts} polls`);
}
