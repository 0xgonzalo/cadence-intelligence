"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { extFromFilename } from "@/lib/audio-url";

interface StoredAsset {
  url?: string;
  path?: string;
  bytes?: number;
  contentType?: string;
  language?: string | null;
}

interface LyricClip {
  source?: string;
  clipStartMs?: number;
  clipEndMs?: number;
  lineCount?: number;
  note?: string;
}

export type PackageAssets = Record<string, unknown> | null;

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const AUDIO_LABEL: Record<string, string> = {
  instrumental: "Instrumental",
  acapella: "Acapella",
  voiceover: "Voiceover",
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function note(v: unknown): { skipped?: string; error?: string } | null {
  const r = asRecord(v);
  if (!r) return null;
  if (typeof r.skipped === "string") return { skipped: r.skipped };
  if (typeof r.error === "string") return { error: r.error };
  return null;
}

function audioAsset(v: unknown): StoredAsset | null {
  const r = asRecord(v);
  if (!r || typeof r.url !== "string") return null;
  return {
    url: r.url,
    bytes: typeof r.bytes === "number" ? r.bytes : undefined,
    contentType: typeof r.contentType === "string" ? r.contentType : undefined,
    language: typeof r.language === "string" ? r.language : null,
  };
}

function lyricClip(v: unknown): LyricClip | null {
  const r = asRecord(v);
  if (!r || typeof r.clipStartMs !== "number") return null;
  return {
    clipStartMs: r.clipStartMs,
    clipEndMs: typeof r.clipEndMs === "number" ? r.clipEndMs : undefined,
    lineCount: typeof r.lineCount === "number" ? r.lineCount : undefined,
  };
}

function secs(ms?: number): string {
  return ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`;
}

export function PackagePreview({
  opportunityId,
  status,
  assets,
  hasBriefs,
}: {
  opportunityId: string;
  status: string | null;
  assets: PackageAssets;
  hasBriefs: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);

  function pickFile(f: File | null) {
    setError(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (!extFromFilename(f.name)) {
      setError("Unsupported file type — use mp3, wav, m4a, flac, aac, or ogg.");
      return;
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      setError("File too large — max 100 MB.");
      return;
    }
    setFile(f);
  }

  async function build() {
    setPending(true);
    setError(null);
    try {
      let audioPath: string | undefined;
      if (file) {
        setUploading(true);
        const up = await fetch("/api/assets/upload", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ opportunityId, filename: file.name }),
        });
        const upJson = await up.json();
        if (!up.ok) throw new Error(upJson.error ?? "Upload init failed");
        const supabase = createClient();
        const { error: putErr } = await supabase.storage
          .from("packages")
          .uploadToSignedUrl(upJson.path, upJson.token, file, {
            contentType: file.type || undefined,
          });
        if (putErr) throw new Error(putErr.message);
        audioPath = upJson.path as string;
        setUploading(false);
      }

      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          opportunityId,
          audioPath,
          audioUrl: !audioPath && audioUrl.trim() ? audioUrl.trim() : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Asset build failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Asset build failed");
    } finally {
      setUploading(false);
      setPending(false);
    }
  }

  const audioKeys = ["instrumental", "acapella", "voiceover"];
  const audioEntries = audioKeys
    .map((k) => ({ key: k, asset: audioAsset(assets?.[k]) }))
    .filter((e): e is { key: string; asset: StoredAsset } => e.asset !== null);
  const clip = lyricClip(assets?.lyricClip);
  const skips = audioKeys
    .map((k) => ({ key: k, note: note(assets?.[k]) }))
    .filter((e): e is { key: string; note: { skipped?: string; error?: string } } =>
      e.note !== null,
    );
  const hasPackage = assets !== null;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
            Content Package
          </p>
          {status ? <Badge variant="solid">{status}</Badge> : null}
        </div>
        <Button onClick={build} disabled={pending || uploading || !hasBriefs}>
          {uploading
            ? "Uploading…"
            : pending
              ? "Building…"
              : hasPackage
                ? "Rebuild package"
                : "Build package"}
        </Button>
      </div>

      {!hasBriefs ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Generate a brief first — the voiceover is read from the brief copy.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Source audio (optional · enables stem separation)
            </p>
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                pickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground hover:border-foreground/40"
            >
              {file ? (
                <span className="font-mono text-[11px]">
                  {uploading ? "Uploading… " : `${file.name} `}·{" "}
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      pickFile(null);
                    }}
                    className="ml-2 underline"
                  >
                    clear
                  </button>
                </span>
              ) : (
                <span>Drop an audio file here, or click to choose</span>
              )}
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <details>
            <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              or paste a link (Google Drive · Dropbox · direct file)
            </summary>
            <input
              id="audioUrl"
              type="url"
              value={audioUrl}
              onChange={(e) => setAudioUrl(e.target.value)}
              placeholder="https://…/track.mp3"
              className="mt-2 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </details>
        </div>
      )}

      {error ? (
        <p className="mt-3 font-mono text-sm text-destructive">{error}</p>
      ) : null}

      {audioEntries.length > 0 ? (
        <div className="mt-5 space-y-4">
          {audioEntries.map(({ key, asset }) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">
                  {AUDIO_LABEL[key] ?? key}
                  {asset.language ? (
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {asset.language}
                    </span>
                  ) : null}
                </p>
                <a
                  href={asset.url}
                  download
                  className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
                >
                  ↓ Download
                </a>
              </div>
              <audio controls src={asset.url} className="w-full" />
            </div>
          ))}
        </div>
      ) : null}

      {clip ? (
        <Card className="mt-5 border-dashed p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Lyric clip · live richsync
          </p>
          <p className="mt-1 text-sm">
            Window {secs(clip.clipStartMs)}–{secs(clip.clipEndMs)}
            {clip.lineCount != null ? ` · ${clip.lineCount} lines` : ""}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Timing only — lyric text is fetched live and never stored.
          </p>
        </Card>
      ) : null}

      {skips.length > 0 ? (
        <ul className="mt-4 space-y-1 border-t border-border/60 pt-3">
          {skips.map(({ key, note: n }) => (
            <li key={key} className="text-[12px] text-muted-foreground">
              {AUDIO_LABEL[key] ?? key}:{" "}
              {n.error ? `failed — ${n.error}` : n.skipped}
            </li>
          ))}
        </ul>
      ) : null}

      {!hasPackage && hasBriefs ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Assemble stems, a voiceover and a lyric-clip window into a downloadable
          package.
        </p>
      ) : null}
    </Card>
  );
}
