import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { extFromFilename } from "@/lib/audio-url";

export const runtime = "nodejs";

const BUCKET = "packages";

/**
 * UPLOAD: mint a short-lived signed *upload* URL for an opportunity's source
 * audio. The browser uploads the file directly to the private `packages` bucket
 * with the returned token (bypassing the serverless body-size cap). The storage
 * path is derived server-side from the DB-trusted opportunity id, so a client
 * can never write outside its own opportunity.
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
  let filename: string | undefined;
  try {
    const raw = await request.json();
    if (raw && typeof raw === "object") {
      const body = raw as { opportunityId?: string; filename?: string };
      opportunityId = body.opportunityId;
      filename = body.filename;
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
  const ext = filename ? extFromFilename(filename) : null;
  if (!ext) {
    return NextResponse.json(
      { error: "unsupported audio file type" },
      { status: 400 },
    );
  }

  // RLS scopes this to the signed-in user's own catalog.
  const { data: opp, error: oppErr } = await supabase
    .from("content_opportunities")
    .select("id")
    .eq("id", opportunityId)
    .single();
  if (oppErr || !opp) {
    return NextResponse.json(
      { error: "Opportunity not found" },
      { status: 404 },
    );
  }

  const path = `${opp.id}/source.${ext}`;
  const service = createServiceClient();
  const { data, error } = await service.storage
    .from(BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "could not create upload url" },
      { status: 500 },
    );
  }

  return NextResponse.json({ path: data.path, token: data.token });
}
