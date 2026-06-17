import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { runOpportunity } from "@/lib/agent/loop";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Drive the full autonomous pipeline for ONE opportunity.
 *
 * Two auth paths:
 *  - Cron/n8n: `Authorization: Bearer ${CRON_SECRET}` runs across every catalog
 *    (no body → newest `new` opportunity anywhere).
 *  - Control room: a signed-in user (no Bearer) can trigger a run, but only for
 *    their OWN opportunities — ownership is verified through the RLS client
 *    before the (RLS-bypassing) pipeline executes.
 *
 * Body `{ opportunityId }` targets a specific opportunity; absent that, the
 * newest `new` opportunity in scope is picked. Returns
 * `{ data: { packageId, opportunityId, status } }`.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const bearerOk =
    !!secret && request.headers.get("authorization") === `Bearer ${secret}`;

  let opportunityId: string | undefined;
  try {
    const raw = await request.json();
    if (raw && typeof raw === "object") {
      opportunityId = (raw as { opportunityId?: string }).opportunityId;
    }
  } catch {
    // No body — fall back to picking the newest `new` opportunity.
  }

  if (!bearerOk) {
    // Session path: must be signed in; scope every lookup to the user via RLS.
    const rls = await createClient();
    const {
      data: { user },
    } = await rls.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (opportunityId) {
      const { data: owned } = await rls
        .from("content_opportunities")
        .select("id")
        .eq("id", opportunityId)
        .maybeSingle();
      if (!owned) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    } else {
      const { data: next } = await rls
        .from("content_opportunities")
        .select("id")
        .eq("status", "new")
        .order("detected_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!next) {
        return NextResponse.json({
          data: { packageId: null, opportunityId: null },
        });
      }
      opportunityId = next.id;
    }
  } else if (!opportunityId) {
    // Cron path with no explicit target: newest `new` across all catalogs.
    const service = createServiceClient();
    const { data: next, error } = await service
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
      return NextResponse.json({
        data: { packageId: null, opportunityId: null },
      });
    }
    opportunityId = next.id;
  }

  try {
    const result = await runOpportunity(opportunityId!);
    return NextResponse.json({ data: result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
