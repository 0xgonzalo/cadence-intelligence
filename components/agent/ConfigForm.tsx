"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FORMATS = [
  "reel",
  "tiktok",
  "short",
  "lyricVideo",
  "staticPost",
  "carousel",
  "faceless",
] as const;

const CADENCES = ["hourly", "daily", "weekly"] as const;

export interface AgentConfigValues {
  cadence: string | null;
  accelerationPct: number;
  formats: string[];
  brandVoice: string | null;
  discordWebhook: string | null;
}

const labelCls =
  "font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground";
const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40";

export function ConfigForm({ initial }: { initial: AgentConfigValues }) {
  const router = useRouter();
  const [cadence, setCadence] = useState(initial.cadence ?? "daily");
  const [accel, setAccel] = useState(initial.accelerationPct);
  const [formats, setFormats] = useState<string[]>(initial.formats);
  const [brandVoice, setBrandVoice] = useState(initial.brandVoice ?? "");
  const [discord, setDiscord] = useState(initial.discordWebhook ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggleFormat(f: string) {
    setFormats((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
    );
  }

  async function save() {
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/agent/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cadence,
          accelerationPct: accel,
          formats,
          brandVoice: brandVoice || null,
          discordWebhook: discord || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="space-y-6 p-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <label className={labelCls} htmlFor="cadence">
            Cadence
          </label>
          <select
            id="cadence"
            className={inputCls}
            value={cadence}
            onChange={(e) => setCadence(e.target.value)}
          >
            {CADENCES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className={labelCls} htmlFor="accel">
            Momentum threshold (+{Math.round(accel * 100)}%)
          </label>
          <input
            id="accel"
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={accel}
            onChange={(e) => setAccel(Number(e.target.value))}
            className="w-full accent-foreground"
          />
        </div>
      </div>

      <div className="space-y-2">
        <span className={labelCls}>Preferred formats</span>
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((f) => {
            const on = formats.includes(f);
            return (
              <button
                key={f}
                type="button"
                onClick={() => toggleFormat(f)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 font-mono text-[11px] tracking-wide transition-colors",
                  on
                    ? "border-foreground bg-secondary text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <label className={labelCls} htmlFor="brandVoice">
          Brand voice
        </label>
        <textarea
          id="brandVoice"
          rows={3}
          className={cn(inputCls, "resize-none")}
          placeholder="e.g. warm, witty, never salesy — speaks to late-night listeners"
          value={brandVoice}
          onChange={(e) => setBrandVoice(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label className={labelCls} htmlFor="discord">
          Discord webhook (weekly plan push)
        </label>
        <input
          id="discord"
          type="url"
          className={inputCls}
          placeholder="https://discord.com/api/webhooks/…"
          value={discord}
          onChange={(e) => setDiscord(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save config"}
        </Button>
        {saved ? (
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Saved
          </span>
        ) : null}
        {error ? (
          <span className="font-mono text-sm text-destructive">{error}</span>
        ) : null}
      </div>
    </Card>
  );
}
