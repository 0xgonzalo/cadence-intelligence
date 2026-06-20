import { describe, it, expect } from "vitest";
import { APICallError } from "ai";
import { classifyGatewayError } from "@/lib/ai";

const UPGRADE_URL =
  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dtop-up";

function gatewayError(statusCode: number, message: string): APICallError {
  return new APICallError({
    message,
    url: "https://ai-gateway.vercel.sh/v1/chat/completions",
    requestBodyValues: {},
    statusCode,
  });
}

describe("classifyGatewayError", () => {
  it("maps a 429 to a retry-friendly rate-limit message", () => {
    const err = gatewayError(
      429,
      `Free tier requests on this model are rate-limited. Upgrade to paid credits at ${UPGRADE_URL} for unrestricted access.`,
    );
    const info = classifyGatewayError(err);
    expect(info.status).toBe(429);
    expect(info.message).toMatch(/rate-limited/i);
    expect(info.message).not.toContain(UPGRADE_URL);
  });

  it("maps a 403 to a plan/model message without leaking the upgrade URL", () => {
    const err = gatewayError(
      403,
      `Free tier users do not have access to this model. Upgrade to paid credits at ${UPGRADE_URL} for unrestricted access.`,
    );
    const info = classifyGatewayError(err);
    expect(info.status).toBe(403);
    expect(info.message).toMatch(/model/i);
    expect(info.message).not.toContain(UPGRADE_URL);
  });

  it("passes a generic Error through as a 502 with its message", () => {
    const info = classifyGatewayError(new Error("schema mismatch"));
    expect(info.status).toBe(502);
    expect(info.message).toBe("Generation failed: schema mismatch");
  });

  it("handles non-Error throws as a 502", () => {
    const info = classifyGatewayError("boom");
    expect(info.status).toBe(502);
    expect(info.message).toContain("boom");
  });
});
