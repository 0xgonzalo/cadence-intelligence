import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchWithTimeout } from "@/lib/http";
import { tts, DEFAULT_VOICE_ID } from "@/lib/partners/elevenlabs";

vi.mock("@/lib/http", () => ({ fetchWithTimeout: vi.fn() }));
const mockFetch = vi.mocked(fetchWithTimeout);

function audioResponse(bytes = new Uint8Array([1, 2, 3, 4])): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    arrayBuffer: async () => bytes.buffer,
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
  process.env.ELEVENLABS_API_KEY = "test-key";
});

describe("elevenlabs adapter", () => {
  it("throws when ELEVENLABS_API_KEY is unset", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    await expect(tts("hello")).rejects.toThrow("ELEVENLABS_API_KEY");
  });

  it("synthesizes speech and returns audio bytes", async () => {
    mockFetch.mockResolvedValue(audioResponse(new Uint8Array([9, 8, 7])));

    const bytes = await tts("dance with me", "voice-42", "es");

    expect(Array.from(bytes)).toEqual([9, 8, 7]);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/text-to-speech/voice-42");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["xi-api-key"]).toBe("test-key");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.text).toBe("dance with me");
    expect(body.language_code).toBe("es");
  });

  it("falls back to the default voice when none is given", async () => {
    mockFetch.mockResolvedValue(audioResponse());

    await tts("hello");

    expect(mockFetch.mock.calls[0][0]).toContain(
      `/text-to-speech/${DEFAULT_VOICE_ID}`,
    );
  });

  it("throws on a non-2xx response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      statusText: "Unprocessable Entity",
    } as unknown as Response);

    await expect(tts("hello")).rejects.toThrow(/422/);
  });
});
