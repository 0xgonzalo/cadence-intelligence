import { describe, it, expect } from "vitest";
import { parseAllowlist, isEmailAllowed } from "@/lib/auth/allowlist";

describe("auth allowlist", () => {
  it("parses a comma-separated list, trimming and lowercasing", () => {
    expect(parseAllowlist(" A@x.com , b@Y.com ")).toEqual(["a@x.com", "b@y.com"]);
  });

  it("returns an empty list for undefined or blank input", () => {
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist("   ")).toEqual([]);
  });

  it("allows an exact email match, case-insensitively", () => {
    expect(isEmailAllowed("User@Example.com", "user@example.com")).toBe(true);
  });

  it("rejects an email not on the list", () => {
    expect(isEmailAllowed("nope@example.com", "user@example.com")).toBe(false);
  });

  it("allows any address on an allowlisted domain via an @domain entry", () => {
    expect(isEmailAllowed("anyone@team.co", "@team.co")).toBe(true);
    expect(isEmailAllowed("anyone@other.co", "@team.co")).toBe(false);
  });

  it("denies everything when the allowlist is empty", () => {
    expect(isEmailAllowed("user@example.com", "")).toBe(false);
    expect(isEmailAllowed("user@example.com", undefined)).toBe(false);
  });
});
