import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runOpportunity } from "@/lib/agent/loop";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Drive the full autonomous pipeline for ONE opportunity. Bearer-gated for
 * cron/n8n and run with the service client (RLS-bypassing) so it works without
 * a user session. Body `{ opportunityId }` targets a specific opportunity;
 * absent that, it picks the newest `new` opportunity across every catalog.
 * Returns `{ data: { packageId, opportunityId, status } }`.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let opportunityId: string | undefined;
  try {
    const raw = await request.json();
    if (raw && typeof raw === "object") {
      opportunityId = (raw as { opportunityId?: string }).opportunityId;
    }
  } catch {
    // No body — fall back to picking the newest `new` opportunity.
  }

  const supabase = createServiceClient();

  if (!opportunityId) {
    const { data: next, error } = await supabase
      .from("content_opportunities")
      .select("id")
      .eq("status", "new")
      .order("detected_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!next) {
      return NextResponse.json({ data: { packageId: null, opportunityId: null } });
    }
    opportunityId = next.id;
  }

  try {
    const result = await runOpportunity(opportunityId);
    return NextResponse.json({ data: result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
