import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { runSignalPoll } from "@/lib/signal/poll";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Session-gated counterpart to the cron poll: lets a signed-in user trigger a
 * WATCH + DETECT tick from the UI ("Refresh signals" on the Radar). Auth is the
 * Supabase session; the sweep itself runs with the service client, same as cron.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await runSignalPoll(createServiceClient());
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Signal poll failed" },
      { status: 500 },
    );
  }
}
