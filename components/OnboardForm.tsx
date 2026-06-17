"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseIsrcs } from "@/lib/onboarding";

const labelCls =
  "font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground";
const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40";

export function OnboardForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [isrcText, setIsrcText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isrcs = parseIsrcs(isrcText);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/artists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          spotifyUrl: spotifyUrl || undefined,
          isrcs,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Onboarding failed");
      router.push("/radar");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onboarding failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="max-w-xl space-y-6 p-6">
      <div className="space-y-2">
        <label className={labelCls} htmlFor="name">
          Artist name
        </label>
        <input
          id="name"
          className={inputCls}
          placeholder="e.g. Phoebe Bridgers"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label className={labelCls} htmlFor="spotifyUrl">
          Spotify URL (optional)
        </label>
        <input
          id="spotifyUrl"
          type="url"
          className={inputCls}
          placeholder="https://open.spotify.com/artist/…"
          value={spotifyUrl}
          onChange={(e) => setSpotifyUrl(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label className={labelCls} htmlFor="isrcs">
          Track ISRCs — one per line or comma-separated
        </label>
        <textarea
          id="isrcs"
          rows={5}
          className={cn(inputCls, "resize-none font-mono text-xs")}
          placeholder={"USRC17600001\nGBUM71029604"}
          value={isrcText}
          onChange={(e) => setIsrcText(e.target.value)}
        />
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {isrcs.length} track{isrcs.length === 1 ? "" : "s"} detected
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={pending || !name.trim()}>
          {pending ? "Onboarding…" : "Onboard artist"}
        </Button>
        {error ? (
          <span className="font-mono text-sm text-destructive">{error}</span>
        ) : null}
      </div>
    </Card>
  );
}
