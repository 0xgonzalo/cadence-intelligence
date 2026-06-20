/**
 * AI model wiring — all generation routes through the Vercel AI Gateway.
 *
 * Per root AGENTS.md, generation goes through the gateway using
 * `AI_GATEWAY_API_KEY`. AI SDK v6's default provider IS the gateway, so passing
 * a plain `"provider/model"` string to `generateObject` resolves through it —
 * no provider-specific package required.
 *
 * The default model must be reachable on the gateway's free tier. Sonnet/Opus
 * return 403 ("Free tier users do not have access to this model") on a key
 * without paid credits; the Haiku tier is allowed (rate-limited, not blocked).
 * Verified against a live `curl https://ai-gateway.vercel.sh/v1/models`.
 * Override without code changes via `CADENCE_AI_MODEL` — e.g. point it at
 * `anthropic/claude-sonnet-4.5` once the gateway team has paid credits.
 */
import { APICallError, generateObject } from "ai";
import type { z } from "zod";

const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

/** Resolved gateway model id (override per-call, or via `CADENCE_AI_MODEL`). */
export function model(override?: string): string {
  return override ?? process.env.CADENCE_AI_MODEL ?? DEFAULT_MODEL;
}

export interface GenerateStructuredArgs<T> {
  schema: z.ZodType<T>;
  prompt: string;
  system?: string;
  /** Override the gateway model id for this call. */
  modelId?: string;
}

/**
 * Thin wrapper over the AI SDK `generateObject`, pinned to the gateway model.
 * Returns the schema-validated object. Used by the brief generator.
 */
export async function generateStructured<T>({
  schema,
  prompt,
  system,
  modelId,
}: GenerateStructuredArgs<T>): Promise<T> {
  const { object } = await generateObject({
    model: model(modelId),
    schema,
    system,
    prompt,
  });
  return object;
}

export interface GatewayErrorInfo {
  /** HTTP status to return to the client. */
  status: number;
  /** User-facing message, safe to render in the UI. */
  message: string;
}

/**
 * Map an AI Gateway failure to a clean, user-facing message + HTTP status.
 * The gateway rate-limits free-tier models (429) and hard-blocks premium ones
 * (403); both arrive carrying a raw "Upgrade to paid credits at <url>" string
 * we don't want to surface verbatim. The SDK already retries 429s before
 * throwing, so "wait and try again" is the right guidance. Anything else falls
 * through with its original message.
 */
export function classifyGatewayError(err: unknown): GatewayErrorInfo {
  const status = APICallError.isInstance(err) ? err.statusCode : undefined;
  if (status === 429) {
    return {
      status: 429,
      message: "AI is rate-limited right now. Wait a moment and try again.",
    };
  }
  if (status === 403) {
    return {
      status: 403,
      message:
        "The configured AI model isn't available on the current gateway plan. Set CADENCE_AI_MODEL to a free-tier model or add gateway credits.",
    };
  }
  const raw = err instanceof Error ? err.message : String(err);
  return { status: 502, message: `Generation failed: ${raw}` };
}
