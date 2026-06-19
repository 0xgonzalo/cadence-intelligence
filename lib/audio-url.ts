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
