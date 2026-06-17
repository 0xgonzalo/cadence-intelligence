import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "packages";
const DEFAULT_MAX_AGE_HOURS = 12;

/**
 * Compliance backstop for generated, lyric-derived assets: delete `packages`
 * storage objects older than `?hours=` (default 12). Generated stems, voiceover
 * and clip media are "on-demand and ephemeral" per the PRD — this cron is what
 * makes that true. Gated on `Bearer ${CRON_SECRET}`.
 */
export async function POST(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hoursParam = new URL(request.url).searchParams.get("hours");
  const maxAgeHours =
    hoursParam && Number.isFinite(Number(hoursParam))
      ? Number(hoursParam)
      : DEFAULT_MAX_AGE_HOURS;
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;

  const service = createServiceClient();
  const store = service.storage.from(BUCKET);

  const { data: top, error: listErr } = await store.list("", { limit: 1000 });
  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  const toDelete: string[] = [];
  for (const entry of top ?? []) {
    // Folder entries (per-opportunity prefixes) have a null id; recurse one level.
    if (entry.id == null) {
      const { data: files } = await store.list(entry.name, { limit: 1000 });
      for (const f of files ?? []) {
        const created = f.created_at ? new Date(f.created_at).getTime() : 0;
        if (created && created < cutoff) toDelete.push(`${entry.name}/${f.name}`);
      }
    } else {
      const created = entry.created_at ? new Date(entry.created_at).getTime() : 0;
      if (created && created < cutoff) toDelete.push(entry.name);
    }
  }

  if (toDelete.length > 0) {
    const { error: rmErr } = await store.remove(toDelete);
    if (rmErr) {
      return NextResponse.json({ error: rmErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    data: { removed: toDelete.length, cutoff: new Date(cutoff).toISOString() },
  });
}
