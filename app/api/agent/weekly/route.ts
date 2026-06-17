import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchWithTimeout } from "@/lib/http";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Monday (UTC) of the current ISO week, as a YYYY-MM-DD date string. */
function weekStartUTC(now: Date): string {
  const day = now.getUTCDay(); // 0 Sun … 6 Sat
  const sinceMonday = (day + 6) % 7;
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - sinceMonday),
  );
  return monday.toISOString().slice(0, 10);
}

const DISCORD_HOSTS = new Set([
  "discord.com",
  "discordapp.com",
  "ptb.discord.com",
  "canary.discord.com",
]);

/** Accept only real Discord webhook URLs — never an arbitrary host (SSRF). */
function discordWebhook(pushTargets: Json | null): string | null {
  if (pushTargets && typeof pushTargets === "object" && !Array.isArray(pushTargets)) {
    const v = (pushTargets as Record<string, unknown>).discord;
    if (typeof v !== "string") return null;
    try {
      const u = new URL(v);
      if (u.protocol === "https:" && DISCORD_HOSTS.has(u.hostname)) return v;
    } catch {
      // not a URL
    }
  }
  return null;
}

/**
 * Compile each artist's opportunities + packages for the current week into a
 * `weekly_plans` row, and (best-effort) push a digest to their Discord webhook.
 * Bearer-gated for cron/n8n; runs with the service client to sweep every
 * catalog. Idempotent per (artist, week): an existing row for the week is
 * replaced. Returns `{ data: { plans, pushed } }`.
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

  const supabase = createServiceClient();
  const now = new Date();
  const weekStart = weekStartUTC(now);
  const weekStartIso = `${weekStart}T00:00:00Z`;

  const { data: artists, error: artistsErr } = await supabase
    .from("artists")
    .select("id, name");
  if (artistsErr) {
    return NextResponse.json({ error: artistsErr.message }, { status: 500 });
  }

  let plans = 0;
  let pushed = 0;

  for (const artist of artists ?? []) {
    const { data: opps } = await supabase
      .from("content_opportunities")
      .select(
        "id, reason, market, language, status, detected_at, tracks(title, isrc), content_packages(status), briefs(format)",
      )
      .eq("artist_id", artist.id)
      .gte("detected_at", weekStartIso)
      .order("detected_at", { ascending: false });

    const items = (opps ?? []).map((o) => {
      const formats = Array.from(
        new Set((o.briefs ?? []).map((b) => b.format)),
      );
      const pkgStatus = o.content_packages?.[0]?.status ?? null;
      return {
        opportunityId: o.id,
        track: o.tracks?.title ?? o.tracks?.isrc ?? "Untitled",
        reason: o.reason,
        market: o.market,
        language: o.language,
        status: o.status,
        formats,
        packageStatus: pkgStatus,
      };
    });

    const readyPackages = items.filter((i) => i.packageStatus === "ready").length;
    const plan = {
      weekStart,
      generatedAt: now.toISOString(),
      totals: { opportunities: items.length, readyPackages },
      items,
    } as unknown as Json;

    // Replace any existing plan for this (artist, week) so re-runs are idempotent.
    await supabase
      .from("weekly_plans")
      .delete()
      .eq("artist_id", artist.id)
      .eq("week_start", weekStart);
    const { error: insErr } = await supabase
      .from("weekly_plans")
      .insert({ artist_id: artist.id, week_start: weekStart, plan });
    if (insErr) continue;
    plans++;

    // Optional Discord digest.
    const { data: config } = await supabase
      .from("agent_config")
      .select("push_targets")
      .eq("artist_id", artist.id)
      .maybeSingle();
    const webhook = discordWebhook(config?.push_targets ?? null);
    if (!webhook) continue;

    const top = items
      .slice(0, 5)
      .map(
        (i) =>
          `• ${i.track} — ${i.market ?? "global"} (${i.packageStatus ?? i.status})`,
      )
      .join("\n");
    const content = [
      `**CADENCE weekly plan — ${artist.name}** (week of ${weekStart})`,
      `${items.length} opportunity(ies), ${readyPackages} package(s) ready.`,
      top,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const res = await fetchWithTimeout(
        webhook,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content }),
        },
        8000,
      );
      if (res.ok) pushed++;
    } catch {
      // Webhook push is best-effort.
    }
  }

  return NextResponse.json({ data: { weekStart, plans, pushed } });
}
