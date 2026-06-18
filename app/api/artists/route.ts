import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { normalizeOnboardTracks } from "@/lib/onboarding";

export const runtime = "nodejs";

const BodySchema = z.object({
  name: z.string(),
  spotifyUrl: z.string().optional(),
  tracks: z
    .array(
      z.object({
        title: z.string(),
        isrc: z.string().nullish(),
        mxmTrackId: z.string().nullish(),
      }),
    )
    .optional()
    .default([]),
});

/**
 * Onboard an artist for the signed-in user and index the songs they picked from
 * the catalog (real titles + Musixmatch ids, ISRC resolved when available).
 * RLS scopes the rows to `auth.uid()` via the owner policies.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  const name = parsed.data.name.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const spotifyUrl = parsed.data.spotifyUrl?.trim() || null;
  const tracks = normalizeOnboardTracks(parsed.data.tracks);

  const { data: artist, error: artistError } = await supabase
    .from("artists")
    .insert({ user_id: user.id, name, spotify_url: spotifyUrl })
    .select()
    .single();
  if (artistError || !artist) {
    return NextResponse.json(
      { error: artistError?.message ?? "Failed to create artist" },
      { status: 500 },
    );
  }

  if (tracks.length > 0) {
    const { error: tracksError } = await supabase.from("tracks").insert(
      tracks.map((t) => ({
        artist_id: artist.id,
        isrc: t.isrc,
        title: t.title,
        mxm_track_id: t.mxmTrackId,
      })),
    );
    if (tracksError) {
      return NextResponse.json({ error: tracksError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ data: artist }, { status: 201 });
}
