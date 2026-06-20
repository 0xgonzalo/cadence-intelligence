import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  searchArtistCandidates,
  getArtistTracks,
} from "@/lib/partners/musixmatch";

export const runtime = "nodejs";

/**
 * Catalog lookup powering onboarding's artist/song picker. `?q=` searches
 * artists by name; `?artistId=` lists that artist's top tracks (with ISRCs
 * resolved under the hood). Auth-gated so only a signed-in user spends
 * Musixmatch quota.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const artistId = searchParams.get("artistId")?.trim();
  const q = searchParams.get("q")?.trim();

  try {
    if (artistId) {
      const limit = Number(searchParams.get("limit")) || 3;
      return NextResponse.json({ data: await getArtistTracks(artistId, limit) });
    }
    if (q) {
      return NextResponse.json({ data: await searchArtistCandidates(q) });
    }
    return NextResponse.json(
      { error: "Provide a `q` (artist name) or `artistId` query param" },
      { status: 400 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Catalog lookup failed" },
      { status: 502 },
    );
  }
}
