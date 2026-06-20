"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ArtistCandidate, ArtistTrack } from "@/lib/partners/musixmatch";

const labelCls =
  "font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground";
const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40";

export function OnboardForm() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [artists, setArtists] = useState<ArtistCandidate[]>([]);

  const [artist, setArtist] = useState<ArtistCandidate | null>(null);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [tracks, setTracks] = useState<ArtistTrack[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearched(false);
    setError(null);
    try {
      const res = await fetch(`/api/catalog?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Search failed");
      setArtists(json.data as ArtistCandidate[]);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function pickArtist(a: ArtistCandidate) {
    setArtist(a);
    setLoadingTracks(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/catalog?artistId=${encodeURIComponent(a.artistId)}&limit=3`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load songs");
      const list = json.data as ArtistTrack[];
      setTracks(list);
      setSelected(new Set(list.map((t) => t.mxmTrackId)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load songs");
    } finally {
      setLoadingTracks(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function changeArtist() {
    setArtist(null);
    setTracks([]);
    setSelected(new Set());
    setError(null);
  }

  async function submit() {
    if (!artist) return;
    const chosen = tracks.filter((t) => selected.has(t.mxmTrackId));
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/artists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: artist.name,
          tracks: chosen.map((t) => ({
            title: t.title,
            isrc: t.isrc,
            mxmTrackId: t.mxmTrackId,
          })),
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
      {!artist ? (
        <>
          <div className="space-y-2">
            <label className={labelCls} htmlFor="artist-search">
              Find your artist
            </label>
            <div className="flex gap-2">
              <input
                id="artist-search"
                className={inputCls}
                placeholder="e.g. Phoebe Bridgers"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runSearch();
                  }
                }}
              />
              <Button
                onClick={runSearch}
                disabled={searching || !query.trim()}
                className="shrink-0"
              >
                {searching ? "Searching…" : "Search"}
              </Button>
            </div>
            <p className={labelCls}>
              We resolve your songs and their ISRCs for you — no codes to paste.
            </p>
          </div>

          {searched && artists.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No artists found. Try the exact name as it appears on streaming.
            </p>
          ) : null}

          {artists.length > 0 ? (
            <ul className="space-y-2">
              {artists.map((a) => (
                <li key={a.artistId}>
                  <button
                    type="button"
                    onClick={() => pickArtist(a)}
                    className="flex w-full flex-col gap-1.5 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:border-foreground/40"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">{a.name}</span>
                      {a.country ? (
                        <span className={labelCls}>{a.country}</span>
                      ) : null}
                    </span>
                    {a.topTracks.length > 0 ? (
                      <span className="text-xs text-muted-foreground">
                        {a.topTracks.join(" · ")}
                      </span>
                    ) : (
                      <span className="text-xs italic text-muted-foreground/70">
                        no tracks on Musixmatch
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className={labelCls}>Selected artist</p>
              <p className="text-lg font-semibold tracking-tight">
                {artist.name}
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={changeArtist}
              disabled={pending}
              className="shrink-0"
            >
              Change
            </Button>
          </div>

          <div className="space-y-2">
            <p className={labelCls}>Your main songs</p>
            {loadingTracks ? (
              <p className="text-sm text-muted-foreground">Loading songs…</p>
            ) : tracks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No songs found for this artist on Musixmatch.
              </p>
            ) : (
              <ul className="space-y-2">
                {tracks.map((t) => {
                  const on = selected.has(t.mxmTrackId);
                  return (
                    <li key={t.mxmTrackId}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                          on
                            ? "border-foreground/40 bg-muted/40"
                            : "border-border hover:border-foreground/20",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(t.mxmTrackId)}
                          className="size-4 accent-foreground"
                        />
                        <span className="flex-1 text-sm font-medium">
                          {t.title}
                        </span>
                        <span className={labelCls}>
                          {t.isrc ?? "no ISRC"}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={submit}
              disabled={pending || selected.size === 0}
            >
              {pending
                ? "Onboarding…"
                : `Onboard ${selected.size} song${selected.size === 1 ? "" : "s"}`}
            </Button>
            {error ? (
              <span className="font-mono text-sm text-destructive">{error}</span>
            ) : null}
          </div>
        </>
      )}

      {!artist && error ? (
        <span className="font-mono text-sm text-destructive">{error}</span>
      ) : null}
    </Card>
  );
}
