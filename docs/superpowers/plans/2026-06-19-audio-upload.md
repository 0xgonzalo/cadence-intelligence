# Audio Source Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let artists supply stem-separation source audio by uploading a file or pasting a Google Drive / Dropbox link, instead of only a raw direct-file URL.

**Architecture:** A new authenticated route mints a Supabase signed *upload* URL scoped to `${oppId}/source.<ext>`; the browser uploads the file directly to the private `packages` bucket (bypassing Vercel's ~4.5 MB function-body cap). The existing `/api/assets` build route gains an `audioPath` branch that downloads those bytes via the service client and feeds the existing LALAL pipeline. A pure `normalizeAudioUrl` helper rewrites share links to direct-download form before the existing SSRF check.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, `@supabase/ssr` (browser + server clients), `@supabase/storage-js` 2.108.2, Vitest 4, Zod 4.

## Global Constraints

- The `packages` bucket is **private, service-role only** — browser writes go through a server-minted signed upload URL; reads through short-lived signed URLs. Do NOT add storage RLS policies.
- Server-side fetches of user URLs MUST pass `assertSafeUrl` (https + public host) — never bypass it.
- Storage paths are always derived from the **DB-trusted opportunity id**, never from a raw client value.
- No lyric text is ever persisted (unchanged here — stems/voiceover are audio bytes only).
- Test runner: `npm test` (`vitest run`), unit tests live in `tests/unit/**/*.test.ts`, environment `node`, `@` alias = repo root.
- Accepted audio extensions (single source of truth): `mp3, wav, m4a, flac, aac, ogg`. Soft size cap: 100 MB.
- One commit per task, conventional-commit messages.

---

### Task 1: `lib/audio-url.ts` — URL normalization + filename/path helpers

**Files:**
- Create: `lib/audio-url.ts`
- Test: `tests/unit/audio-url.test.ts`

**Interfaces:**
- Consumes: nothing (pure functions).
- Produces:
  - `normalizeAudioUrl(raw: string): string` — rewrites Drive/Dropbox share links to direct-download form; returns other input unchanged.
  - `extFromFilename(name: string): string | null` — returns a lowercase extension from the accepted allowlist, or `null`.
  - `isInOpportunityScope(oppId: string, path: string): boolean` — true iff `path` is `${oppId}/…` and contains no `..` segment.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/audio-url.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  normalizeAudioUrl,
  extFromFilename,
  isInOpportunityScope,
} from "@/lib/audio-url";

describe("normalizeAudioUrl", () => {
  it("rewrites a Google Drive /file/d/ link to direct download", () => {
    expect(
      normalizeAudioUrl("https://drive.google.com/file/d/ABC123/view?usp=sharing"),
    ).toBe("https://drive.google.com/uc?export=download&id=ABC123");
  });

  it("rewrites a Google Drive open?id= link to direct download", () => {
    expect(
      normalizeAudioUrl("https://drive.google.com/open?id=XYZ789"),
    ).toBe("https://drive.google.com/uc?export=download&id=XYZ789");
  });

  it("forces dl=1 on a Dropbox share link", () => {
    expect(
      normalizeAudioUrl("https://www.dropbox.com/s/abc/track.mp3?dl=0"),
    ).toBe("https://www.dropbox.com/s/abc/track.mp3?dl=1");
  });

  it("adds dl=1 to a Dropbox link with no dl param", () => {
    expect(
      normalizeAudioUrl("https://www.dropbox.com/s/abc/track.mp3"),
    ).toBe("https://www.dropbox.com/s/abc/track.mp3?dl=1");
  });

  it("returns a plain direct file URL unchanged", () => {
    expect(normalizeAudioUrl("https://cdn.example.com/track.mp3")).toBe(
      "https://cdn.example.com/track.mp3",
    );
  });

  it("returns non-URL junk unchanged", () => {
    expect(normalizeAudioUrl("not a url")).toBe("not a url");
  });
});

describe("extFromFilename", () => {
  it("returns the lowercased extension when accepted", () => {
    expect(extFromFilename("My Song.MP3")).toBe("mp3");
    expect(extFromFilename("track.wav")).toBe("wav");
  });

  it("returns null for an unaccepted extension", () => {
    expect(extFromFilename("doc.pdf")).toBeNull();
    expect(extFromFilename("noext")).toBeNull();
  });
});

describe("isInOpportunityScope", () => {
  it("accepts a path under the opportunity id", () => {
    expect(isInOpportunityScope("opp-1", "opp-1/source.mp3")).toBe(true);
  });

  it("rejects a path under a different id", () => {
    expect(isInOpportunityScope("opp-1", "opp-2/source.mp3")).toBe(false);
  });

  it("rejects path traversal", () => {
    expect(isInOpportunityScope("opp-1", "opp-1/../opp-2/source.mp3")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- audio-url`
Expected: FAIL — `Cannot find module '@/lib/audio-url'`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/audio-url.ts`:

```ts
/**
 * Pure helpers for stem-separation source audio: rewrite cloud share links to
 * direct-download form, validate upload filenames, and scope storage paths to
 * an opportunity. No I/O — safe to import from both server and client code.
 */

const ACCEPTED_EXT = new Set(["mp3", "wav", "m4a", "flac", "aac", "ogg"]);

/**
 * Rewrite a Google Drive / Dropbox *share* link into a direct-download URL so a
 * server-side fetch receives the file bytes, not an HTML page. Other input
 * (already-direct URLs, junk) is returned unchanged.
 *
 * Caveat: Drive interposes a virus-scan confirmation page for very large files
 * (>~100 MB); songs are well under that, so this is acceptable.
 */
export function normalizeAudioUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  const host = url.hostname.toLowerCase();

  if (host === "drive.google.com") {
    const byPath = url.pathname.match(/\/file\/d\/([^/]+)/);
    const id = byPath?.[1] ?? url.searchParams.get("id");
    if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
    return raw;
  }

  if (host.endsWith("dropbox.com")) {
    url.searchParams.set("dl", "1");
    return url.toString();
  }

  return raw;
}

/** Lowercase extension if it is an accepted audio type, else null. */
export function extFromFilename(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return ACCEPTED_EXT.has(ext) ? ext : null;
}

/** True iff `path` lives directly under `${oppId}/` with no traversal. */
export function isInOpportunityScope(oppId: string, path: string): boolean {
  if (path.includes("..")) return false;
  return path.startsWith(`${oppId}/`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- audio-url`
Expected: PASS (all cases in the three `describe` blocks).

- [ ] **Step 5: Commit**

```bash
git add lib/audio-url.ts tests/unit/audio-url.test.ts
git commit -m "feat: add audio-url helpers (normalize links, validate ext, scope path)"
```

---

### Task 2: `POST /api/assets/upload` — mint a signed upload URL

**Files:**
- Create: `app/api/assets/upload/route.ts`

**Interfaces:**
- Consumes: `extFromFilename` from `@/lib/audio-url`; `createClient`, `createServiceClient` from `@/lib/supabase/server`.
- Produces: route returning `{ path: string, token: string }` for `{ opportunityId: string, filename: string }`.

- [ ] **Step 1: Write the route**

Create `app/api/assets/upload/route.ts`:

```ts
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
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Manual verification (deferred to Task 4)**

This route has no caller yet; it is exercised end-to-end in Task 4's UI verification. No unit test — it is a thin auth + storage wrapper consistent with the repo's other route handlers (which are not unit-tested). The testable logic (`extFromFilename`) is already covered by Task 1.

- [ ] **Step 4: Commit**

```bash
git add app/api/assets/upload/route.ts
git commit -m "feat: signed upload-url route for opportunity source audio"
```

---

### Task 3: `/api/assets` — `audioPath` branch + link normalization

**Files:**
- Modify: `app/api/assets/route.ts`

**Interfaces:**
- Consumes: `normalizeAudioUrl`, `isInOpportunityScope` from `@/lib/audio-url`; existing `uploadAudio` (accepts `Uint8Array | string`).
- Produces: route now accepts `audioPath?` in the POST body and resolves stems from either an uploaded object or a URL.

- [ ] **Step 1: Add the import**

In `app/api/assets/route.ts`, add after the existing `@/lib/http` import (around line 6):

```ts
import { normalizeAudioUrl, isInOpportunityScope } from "@/lib/audio-url";
```

- [ ] **Step 2: Parse `audioPath` from the body**

Find (around line 113):

```ts
  let opportunityId: string | undefined;
  let audioUrl: string | undefined;
  let requested: AssetType[] = DEFAULT_ASSETS;
```

Replace with:

```ts
  let opportunityId: string | undefined;
  let audioUrl: string | undefined;
  let audioPath: string | undefined;
  let requested: AssetType[] = DEFAULT_ASSETS;
```

Then find (around line 120):

```ts
      const body = raw as {
        opportunityId?: string;
        audioUrl?: string;
        assets?: unknown;
      };
      opportunityId = body.opportunityId;
      audioUrl = body.audioUrl;
```

Replace with:

```ts
      const body = raw as {
        opportunityId?: string;
        audioUrl?: string;
        audioPath?: string;
        assets?: unknown;
      };
      opportunityId = body.opportunityId;
      audioUrl = body.audioUrl;
      audioPath = body.audioPath;
```

- [ ] **Step 3: Normalize the URL before the SSRF check**

Find (around line 145):

```ts
  if (audioUrl) {
    try {
      await assertSafeUrl(audioUrl);
    } catch (e) {
```

Replace the first two lines with (insert the normalize call):

```ts
  if (audioUrl) {
    audioUrl = normalizeAudioUrl(audioUrl);
    try {
      await assertSafeUrl(audioUrl);
    } catch (e) {
```

- [ ] **Step 4: Resolve stems from upload OR url**

Find the stems block (around line 181):

```ts
  if (wantInstrumental || wantAcapella) {
    if (!audioUrl) {
      const note: Json = { skipped: "no audioUrl provided" };
      if (wantInstrumental) results.instrumental = note;
      if (wantAcapella) results.acapella = note;
    } else {
      try {
        const fileId = await uploadAudio(audioUrl, `${track.id}.mp3`);
```

Replace down to the `const fileId` line with:

```ts
  if (wantInstrumental || wantAcapella) {
    // Source the audio bytes from the uploaded object (preferred) or the URL.
    let source: Uint8Array | string | null = null;
    let sourceErr: string | null = null;
    if (audioPath) {
      if (!isInOpportunityScope(oppId, audioPath)) {
        sourceErr = "audioPath outside opportunity scope";
      } else {
        try {
          const { data, error } = await service.storage
            .from(BUCKET)
            .download(audioPath);
          if (error || !data) {
            throw new Error(error?.message ?? "source download failed");
          }
          source = new Uint8Array(await data.arrayBuffer());
        } catch (e) {
          sourceErr = errMsg(e);
        }
      }
    } else if (audioUrl) {
      source = audioUrl;
    }

    if (!source) {
      const note: Json = sourceErr
        ? { error: sourceErr }
        : { skipped: "no audio source provided" };
      if (wantInstrumental) results.instrumental = note;
      if (wantAcapella) results.acapella = note;
    } else {
      try {
        const fileId = await uploadAudio(source, `${track.id}.mp3`);
```

Leave the rest of the block (the `requestSplit` / `pollSplit` / store calls and the `catch`) unchanged — the closing braces still match.

- [ ] **Step 5: Typecheck, lint, and run the full unit suite**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type/lint errors; all existing unit tests + Task 1's pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/assets/route.ts
git commit -m "feat: build stems from uploaded source audio + normalize cloud links"
```

---

### Task 4: `PackagePreview` — file upload UI + link fallback

**Files:**
- Modify: `components/engine/PackagePreview.tsx`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/client`; `extFromFilename` from `@/lib/audio-url`; `/api/assets/upload` (Task 2) and `/api/assets` `audioPath` (Task 3).
- Produces: UI change only.

- [ ] **Step 1: Add imports**

At the top of `components/engine/PackagePreview.tsx`, after the existing `Button` import (line 7), add:

```ts
import { createClient } from "@/lib/supabase/client";
import { extFromFilename } from "@/lib/audio-url";
```

- [ ] **Step 2: Add the size constant**

Below the imports, near the existing `AUDIO_LABEL` constant (around line 26), add:

```ts
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
```

- [ ] **Step 3: Add state and a file-validation handler**

Find (around line 84):

```ts
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
```

Replace with:

```ts
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
```

- [ ] **Step 4: Upload before building**

Find the existing `build()` body (around line 88):

```ts
  async function build() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          opportunityId,
          audioUrl: audioUrl.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Asset build failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Asset build failed");
    } finally {
      setPending(false);
    }
  }
```

Replace with:

```ts
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
```

- [ ] **Step 5: Update the build button disabled/label**

Find (around line 132):

```tsx
        <Button onClick={build} disabled={pending || !hasBriefs}>
          {pending
            ? "Building…"
            : hasPackage
              ? "Rebuild package"
              : "Build package"}
        </Button>
```

Replace with:

```tsx
        <Button onClick={build} disabled={pending || uploading || !hasBriefs}>
          {uploading
            ? "Uploading…"
            : pending
              ? "Building…"
              : hasPackage
                ? "Rebuild package"
                : "Build package"}
        </Button>
```

- [ ] **Step 6: Replace the URL field with upload + link fallback**

Find the `hasBriefs` block that renders the label + URL input (around line 140):

```tsx
      ) : (
        <div className="mt-4 space-y-1">
          <label
            htmlFor="audioUrl"
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
          >
            Audio URL (optional · enables stem separation)
          </label>
          <input
            id="audioUrl"
            type="url"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            placeholder="https://…/track.mp3"
            className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      )}
```

Replace with:

```tsx
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
```

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 8: Manual UI verification**

Run: `npm run dev`, sign in, open an opportunity with a generated brief, and confirm:
1. The dropzone accepts a click-to-choose and a drag-drop of an `.mp3`; filename + size appear; **clear** resets it.
2. Choosing a `.pdf` shows the unsupported-type error; a >100 MB file shows the size error.
3. With a file chosen, **Build package** shows "Uploading…" then "Building…"; on success the instrumental/acapella assets render.
4. With no file but a Google Drive share link pasted in the disclosure, the build produces stems (link normalized server-side).
5. With neither, the build still succeeds and the stem slots show "no audio source provided".

- [ ] **Step 9: Commit**

```bash
git add components/engine/PackagePreview.tsx
git commit -m "feat: upload source audio with drag-drop + link fallback in package builder"
```

---

## Notes for the implementer

- **Why bytes, not a signed read URL, in Task 3:** the build route already runs with the service client, so downloading the object directly avoids a second signed-URL round-trip and an unnecessary `assertSafeUrl` pass.
- **Why `details`/`summary` for the link field:** keeps the power-user path discoverable without competing visually with the primary upload affordance.
- **Ephemeral source:** the cleanup cron deletes bucket objects on a short window, so a later "Rebuild package" needs a re-upload. This is intended (out of scope to persist).
