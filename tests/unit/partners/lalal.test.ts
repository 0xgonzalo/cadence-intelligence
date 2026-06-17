import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchWithTimeout, safeFetch } from "@/lib/http";
import {
  uploadAudio,
  requestSplit,
  checkSplit,
  pollSplit,
} from "@/lib/partners/lalal";

vi.mock("@/lib/http", () => ({
  fetchWithTimeout: vi.fn(),
  safeFetch: vi.fn(),
}));
const mockFetch = vi.mocked(fetchWithTimeout);
const mockSafeFetch = vi.mocked(safeFetch);

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(8),
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
  mockSafeFetch.mockReset();
  process.env.LALAL_API_KEY = "test-key";
});

describe("lalal adapter", () => {
  describe("auth", () => {
    it("throws when LALAL_API_KEY is unset", async () => {
      delete process.env.LALAL_API_KEY;
      await expect(uploadAudio(new Uint8Array([1, 2, 3]))).rejects.toThrow(
        "LALAL_API_KEY",
      );
    });
  });

  describe("uploadAudio", () => {
    it("uploads raw bytes and returns the file id", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ status: "success", id: "file-123" }),
      );

      const id = await uploadAudio(new Uint8Array([1, 2, 3]), "clip.wav");

      expect(id).toBe("file-123");
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/api/upload/");
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe("license test-key");
    });

    it("fetches a URL's bytes (SSRF-guarded) before uploading", async () => {
      mockSafeFetch.mockResolvedValueOnce(jsonResponse({})); // the audio download
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ status: "success", id: "file-xyz" }),
      );

      const id = await uploadAudio("https://cdn.example.com/song.mp3");

      expect(id).toBe("file-xyz");
      expect(mockSafeFetch).toHaveBeenCalledTimes(1);
      expect(mockSafeFetch.mock.calls[0][0]).toBe(
        "https://cdn.example.com/song.mp3",
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toContain("/api/upload/");
    });

    it("throws when LALAL reports an upload error", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ status: "error", error: "bad file" }),
      );

      await expect(uploadAudio(new Uint8Array([1]))).rejects.toThrow(/bad file/);
    });
  });

  describe("requestSplit", () => {
    it("posts the split params for the requested stem", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ status: "success" }));

      await requestSplit("file-123", "vocals");

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/api/split/");
      const body = String((init as RequestInit).body);
      expect(body).toContain("file-123");
      expect(body).toContain("vocals");
    });
  });

  describe("checkSplit", () => {
    it("maps a finished split to stem + back-track urls", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          status: "success",
          result: {
            "file-123": {
              task: { state: "success" },
              split: {
                stem_track: "https://lalal/stem.wav",
                back_track: "https://lalal/back.wav",
              },
            },
          },
        }),
      );

      const status = await checkSplit("file-123");

      expect(status).toEqual({
        state: "success",
        stemUrl: "https://lalal/stem.wav",
        backUrl: "https://lalal/back.wav",
        error: null,
      });
    });

    it("reports in-progress with no urls yet", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          status: "success",
          result: { "file-123": { task: { state: "progress" } } },
        }),
      );

      const status = await checkSplit("file-123");

      expect(status.state).toBe("progress");
      expect(status.stemUrl).toBeNull();
      expect(status.backUrl).toBeNull();
    });
  });

  describe("pollSplit", () => {
    it("polls until the split reaches a terminal state", async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({
            status: "success",
            result: { "file-123": { task: { state: "progress" } } },
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            status: "success",
            result: {
              "file-123": {
                task: { state: "success" },
                split: {
                  stem_track: "https://lalal/stem.wav",
                  back_track: "https://lalal/back.wav",
                },
              },
            },
          }),
        );

      const status = await pollSplit("file-123", {
        intervalMs: 0,
        sleep: async () => {},
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(status.state).toBe("success");
      expect(status.stemUrl).toBe("https://lalal/stem.wav");
    });

    it("gives up after maxAttempts and throws", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          status: "success",
          result: { "file-123": { task: { state: "progress" } } },
        }),
      );

      await expect(
        pollSplit("file-123", {
          intervalMs: 0,
          maxAttempts: 3,
          sleep: async () => {},
        }),
      ).rejects.toThrow(/timed out/i);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });
});
