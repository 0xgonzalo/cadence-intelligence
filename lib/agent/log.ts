import type { DbClient } from "@/lib/supabase/server";
import type { LogLevel } from "@/lib/domain/types";
import type { Json } from "@/lib/supabase/types";

export interface LogAgentInput {
  artistId: string;
  message: string;
  level?: LogLevel;
  /** Pipeline stage: WATCH / DETECT / ANALYZE / GENERATE / PACKAGE / SURFACE. */
  phase?: string | null;
  payload?: Json;
}

/**
 * Append one row to `agent_log` — the live activity feed that demonstrates the
 * agent is running. Best-effort: logging never throws, so a logging failure
 * can't abort a pipeline run. Pass a service client for cron/agent contexts.
 */
export async function logAgent(
  client: DbClient,
  { artistId, message, level = "info", phase = null, payload = null }: LogAgentInput,
): Promise<void> {
  try {
    await client.from("agent_log").insert({
      artist_id: artistId,
      level,
      phase,
      message,
      payload,
    });
  } catch {
    // Activity logging is non-critical; swallow to protect the pipeline.
  }
}
