import { createClient } from "@/lib/supabase/server";
import { ConfigForm, type AgentConfigValues } from "@/components/agent/ConfigForm";
import { LiveLog } from "@/components/agent/LiveLog";

export const dynamic = "force-dynamic";

function accelOf(thresholds: unknown): number {
  if (thresholds && typeof thresholds === "object" && !Array.isArray(thresholds)) {
    const v = (thresholds as Record<string, unknown>).accelerationPct;
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 0.25;
}

function discordOf(pushTargets: unknown): string | null {
  if (pushTargets && typeof pushTargets === "object" && !Array.isArray(pushTargets)) {
    const v = (pushTargets as Record<string, unknown>).discord;
    if (typeof v === "string") return v;
  }
  return null;
}

export default async function AgentPage({
  searchParams,
}: {
  searchParams: Promise<{ artist?: string }>;
}) {
  const { artist: artistParam } = await searchParams;
  const supabase = await createClient();

  // The selected artist (RLS scopes to the user's roster); fall back to their
  // first-onboarded artist when no valid selection is present.
  const { data: selected } = artistParam
    ? await supabase
        .from("artists")
        .select("id, name")
        .eq("id", artistParam)
        .maybeSingle()
    : { data: null };

  const { data: artist } = selected
    ? { data: selected }
    : await supabase
        .from("artists")
        .select("id, name")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

  const { data: config } = artist
    ? await supabase
        .from("agent_config")
        .select("cadence, thresholds, formats, brand_voice, push_targets")
        .eq("artist_id", artist.id)
        .maybeSingle()
    : { data: null };

  const initial: AgentConfigValues = {
    cadence: config?.cadence ?? "daily",
    accelerationPct: accelOf(config?.thresholds),
    formats: config?.formats ?? ["reel", "tiktok", "short"],
    brandVoice: config?.brand_voice ?? null,
    discordWebhook: discordOf(config?.push_targets),
  };

  return (
    <div className="space-y-8">
      <div className="border-b border-border pb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          Agent control room
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {artist?.name ?? "The agent"}
        </h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Tune what the agent watches for and how it speaks, then watch it work
          the pipeline in real time — WATCH → DETECT → ANALYZE → GENERATE →
          PACKAGE → SURFACE.
        </p>
      </div>

      {artist ? (
        <ConfigForm artistId={artist.id} initial={initial} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Onboard an artist on the Radar to configure the agent.
        </p>
      )}

      <LiveLog artistId={artist?.id ?? null} />
    </div>
  );
}
