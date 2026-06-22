import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateCaptionCards } from "@/lib/generation/captions";
import { classifyGatewayError } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * CAPTIONS: draft ready-to-post social captions for one opportunity from its
 * existing signal context (Songstats momentum or a JamBase live-show trigger).
 * Ephemeral — captions are returned, not persisted. RLS scopes the opportunity
 * read to the signed-in user's own catalog.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let opportunityId: string | undefined;
  try {
    const raw = await request.json();
    if (raw && typeof raw === "object") {
      opportunityId = (raw as { opportunityId?: string }).opportunityId;
    }
  } catch {
    // fall through to validation
  }
  if (!opportunityId) {
    return NextResponse.json(
      { error: "opportunityId is required" },
      { status: 400 },
    );
  }

  const { data: opp, error } = await supabase
    .from("content_opportunities")
    .select(
      "id, reason, market, language, signal_delta, tracks(title), artists(name)",
    )
    .eq("id", opportunityId)
    .single();
  if (error || !opp) {
    return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  }

  const delta =
    opp.signal_delta && typeof opp.signal_delta === "object" && !Array.isArray(opp.signal_delta)
      ? (opp.signal_delta as { metric?: string; from?: number; to?: number; pct?: number })
      : null;

  try {
    const cards = await generateCaptionCards({
      kind: opp.tracks ? "momentum" : "show",
      reason: opp.reason,
      market: opp.market,
      language: opp.language,
      signalDelta: delta,
      trackTitle: opp.tracks?.title ?? null,
      artistName: opp.artists?.name ?? null,
    });
    return NextResponse.json({ data: { cards } });
  } catch (e) {
    const info = classifyGatewayError(e);
    return NextResponse.json({ error: info.message }, { status: info.status });
  }
}
