import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BodySchema = z.object({
  name: z.string(),
  spotifyUrl: z.string().optional(),
  isrcs: z.array(z.string()).optional().default([]),
});

/**
 * Onboard an artist for the signed-in user and index its catalog by ISRC.
 * Tracks start titled by their ISRC; a later intelligence pass enriches the
 * real title. RLS scopes the rows to `auth.uid()` via the owner policies.
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
  const isrcs = [
    ...new Set(
      parsed.data.isrcs.map((i) => i.trim().toUpperCase()).filter(Boolean),
    ),
  ];

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

  if (isrcs.length > 0) {
    const { error: tracksError } = await supabase
      .from("tracks")
      .insert(isrcs.map((isrc) => ({ artist_id: artist.id, isrc, title: isrc })));
    if (tracksError) {
      return NextResponse.json({ error: tracksError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ data: artist }, { status: 201 });
}
