/**
 * Email allowlist for magic-link sign-in. Entries come from
 * `CADENCE_AUTH_ALLOWLIST` (comma-separated). An entry may be a full email
 * (exact match) or an `@domain` entry that allows any address on that domain.
 * An empty/unset allowlist denies everyone.
 */

export function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(
  email: string,
  raw: string | undefined = process.env.CADENCE_AUTH_ALLOWLIST,
): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const domain = normalized.slice(normalized.indexOf("@"));
  return parseAllowlist(raw).some((entry) =>
    entry.startsWith("@") ? entry === domain : entry === normalized,
  );
}
