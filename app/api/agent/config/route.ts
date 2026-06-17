import { NextResponse } from "next/server";
import { createClient, type DbClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";

const CONFIG_COLS =
  "id, artist_id, cadence, thresholds, formats, brand_voice, push_targets";

/** The signed-in user's primary artist (RLS already scopes to their catalog). */
async function resolveArtist(supabase: DbClient) {
  const { data } = await supabase
    .from("artists")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const artist = await resolveArtist(supabase);
  if (!artist) {
    return NextResponse.json({ data: { artist: null, config: null } });
  }

  const { data: config } = await supabase
    .from("agent_config")
    .select(CONFIG_COLS)
    .eq("artist_id", artist.id)
    .maybeSingle();

  return NextResponse.json({ data: { artist, config } });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const artist = await resolveArtist(supabase);
  if (!artist) {
    return NextResponse.json(
      { error: "Onboard an artist before configuring the agent" },
      { status: 400 },
    );
  }

  let body: {
    cadence?: string | null;
    accelerationPct?: number;
    formats?: unknown;
    brandVoice?: string | null;
    discordWebhook?: string | null;
  } = {};
  try {
    const raw = await request.json();
    if (raw && typeof raw === "object") body = raw as typeof body;
  } catch {
    // Empty/invalid body — persist defaults below.
  }

  const formats = Array.isArray(body.formats)
    ? body.formats.filter((f): f is string => typeof f === "string")
    : [];
  const accel =
    typeof body.accelerationPct === "number" &&
    Number.isFinite(body.accelerationPct)
      ? body.accelerationPct
      : 0.25;
  const discord = body.discordWebhook?.trim() || null;

  const row = {
    artist_id: artist.id,
    cadence: body.cadence?.trim() || null,
    thresholds: { accelerationPct: accel } as Json,
    formats,
    brand_voice: body.brandVoice?.trim() || null,
    push_targets: (discord ? { discord } : null) as Json,
  };

  const { data, error } = await supabase
    .from("agent_config")
    .upsert(row, { onConflict: "artist_id" })
    .select(CONFIG_COLS)
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
