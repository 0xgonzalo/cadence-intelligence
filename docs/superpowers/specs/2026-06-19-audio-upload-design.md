# Audio source upload + cloud-link normalization

**Date:** 2026-06-19
**Status:** Approved (design)
**Area:** Content Package builder — stem separation source audio

## Problem

The Content Package builder (`components/engine/PackagePreview.tsx`) collects the
source audio for stem separation through a single free-text **Audio URL** field
expecting a direct file link (e.g. `https://…/track.mp3`). That is a developer's
input, not an artist's: it requires a publicly hosted raw audio file, which most
users cannot produce. Pasting a Spotify/YouTube page link silently does nothing
useful (those are HTML pages / DRM streams, not files).

## Goal

Let artists provide source audio the way they actually have it:

1. **Upload a file** from their device (primary path).
2. **Paste a cloud share link** (Google Drive / Dropbox), auto-converted to a
   direct-download URL (power-user fallback).

Both feed the existing LALAL stem-separation pipeline unchanged.

## Constraints (from the codebase)

- The `packages` Supabase bucket is **private, service-role only** — no storage
  RLS policies; the browser only ever receives short-lived signed URLs
  (`supabase/migrations/0002_packages_storage.sql`).
- `assertSafeUrl` requires **HTTPS + a public host**, and `safeFetch`
  re-validates every redirect hop (`lib/http.ts`). A normalized Drive/Dropbox
  link resolves to a public host and passes.
- `uploadAudio` in `lib/partners/lalal.ts` already accepts **raw bytes
  (`ArrayBuffer | Uint8Array`) OR a URL string**, so the upload path can hand it
  bytes directly without a server-side re-fetch.
- Vercel serverless functions cap request bodies at ~4.5 MB — too small for a
  real song, so the file must NOT be POSTed through a function.

## Approach (chosen: A)

**A. Direct-to-storage via signed upload URL** *(chosen)* — server mints a
signed upload URL scoped to a server-derived path; the browser uploads straight
to Supabase Storage. Bypasses the 4.5 MB function-body cap, keeps the bucket
locked to service-role (the server owns the path), adds one small route.

**B. Through-server multipart upload** *(rejected)* — simpler client, but a real
song (3–10 MB MP3, larger WAV) exceeds Vercel's ~4.5 MB body cap and fails.

**C. Anon-client upload + new storage RLS policies** *(rejected)* — would open
the private bucket's "service-role only" model and add security surface.

## Architecture

### 1. Upload route — `POST /api/assets/upload`
- Authenticate the user (`createClient().auth.getUser`).
- Verify the opportunity belongs to the user (RLS-scoped select on
  `content_opportunities`).
- Derive the storage path **server-side** from the DB-trusted opportunity id:
  `${oppId}/source.<ext>` (ext from an allowlist; client never picks the path).
- `service.storage.from('packages').createSignedUploadUrl(path)` →
  return `{ path, token }`.

### 2. Browser upload (in `PackagePreview.tsx`)
- User selects/drops a file.
- Call `/api/assets/upload` → get `{ path, token }`.
- `supabase.storage.from('packages').uploadToSignedUrl(path, token, file)` using
  the browser client (`lib/supabase/client.ts`).
- On success, call the existing `POST /api/assets` build with
  `{ opportunityId, audioPath: path }`.

### 3. Build route changes — `POST /api/assets`
- Accept `audioPath?` alongside the existing `audioUrl?`.
- When `audioPath` is present:
  - Validate it starts with `${oppId}/` (defense-in-depth against a forged path).
  - Download bytes via the service client
    (`service.storage.from('packages').download(path)`).
  - Pass the bytes straight to `uploadAudio(bytes, …)` — no SSRF round-trip.
- When only `audioUrl` is present: normalize it (below), then the existing
  `assertSafeUrl` → `uploadAudio(url)` path, unchanged.
- If both are absent: existing "no audioUrl provided" skip behavior.

### 4. Link normalization — `lib/audio-url.ts`
`normalizeAudioUrl(raw: string): string` rewrites share links to
direct-download form before `assertSafeUrl`:
- Google Drive `…/file/d/{ID}/view…` or `…?id={ID}` → `https://drive.google.com/uc?export=download&id={ID}`
- Dropbox `?dl=0` (or no flag) → `?dl=1`
- Anything else → returned unchanged.

**Documented caveat:** Google Drive interposes a virus-scan confirmation page for
very large files (>~100 MB), which breaks automated fetching. Songs are well
under that, so it is acceptable; surfaced as a build error if it ever triggers.

### 5. UI — `PackagePreview.tsx`
- Replace the bare URL input with:
  - A **drag-and-drop / file picker** (primary) showing the chosen filename,
    upload progress, and a clear/replace control.
  - A collapsed **"or paste a link"** disclosure containing the existing URL
    input (Drive/Dropbox supported).
- Accept `audio/*` — mp3, wav, m4a, flac, aac, ogg. Soft size cap ~100 MB with a
  friendly inline error.
- Reuse the existing `error` state for upload/type/size failures.

## Data flow

```
file → /api/assets/upload (mint signed URL) → browser uploadToSignedUrl
     → packages/{oppId}/source.<ext> → /api/assets {audioPath}
     → service download bytes → uploadAudio(bytes) → LALAL split → stems stored

link → normalizeAudioUrl → /api/assets {audioUrl}
     → assertSafeUrl → uploadAudio(url) → LALAL split → stems stored
```

## Error handling
- Upload route: 401 unauth, 404 opportunity-not-found, 400 bad extension.
- Browser: surface unsupported-type / oversized / upload-failed inline.
- Build route: per-asset failure tolerance is unchanged (a stem failure writes
  an `{ error }` note and does not abort voiceover / lyric-clip).

## Testing (TDD)
- `tests/unit/audio-url.test.ts` — `normalizeAudioUrl`: Drive `/file/d/` and
  `?id=` variants, Dropbox `?dl=0`→`?dl=1`, pass-through for a plain `.mp3`,
  junk/non-URL input.
- Build-route test — the `audioPath` branch: path-scoping rejection of a path
  outside `${oppId}/`, and bytes-to-`uploadAudio` on a valid path.
- UI is manually verified (file pick, drag-drop, progress, link fallback).

## Out of scope
- Re-using an uploaded source after the ephemeral cleanup cron deletes it
  (rebuild would require re-upload). Acceptable for now.
- Provider support beyond Google Drive / Dropbox for link normalization.
- Transcoding / format conversion (LALAL handles common formats).
```
