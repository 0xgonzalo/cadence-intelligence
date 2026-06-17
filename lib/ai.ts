/**
 * AI model wiring — all generation routes through the Vercel AI Gateway.
 *
 * Per root AGENTS.md, generation goes through the gateway using
 * `AI_GATEWAY_API_KEY`. AI SDK v6's default provider IS the gateway, so passing
 * a plain `"provider/model"` string to `generateObject` resolves through it —
 * no provider-specific package required.
 *
 * The default model slug is documentation-derived and has NOT been confirmed
 * against a live `curl https://ai-gateway.vercel.sh/v1/models` (no
 * `AI_GATEWAY_API_KEY` value was set at build time). Override it without code
 * changes via `CADENCE_AI_MODEL`.
 */
import { generateObject } from "ai";
import type { z } from "zod";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

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
