import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchWithTimeout } from "@/lib/http";
import { getTikTokCreators } from "@/lib/partners/songstats";

vi.mock("@/lib/http", () => ({ fetchWithTimeout: vi.fn() }));
const mockFetch = vi.mocked(fetchWithTimeout);

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
  process.env.SONGSTATS_API_KEY = "test-key";
});

describe("getTikTokCreators", () => {
  it("queries /tracks/activities for the tiktok source with the api key", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ activities: [] }));

    await getTikTokCreators("ISRC123");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/tracks/activities");
    expect(url).toContain("isrc=ISRC123");
    expect(url).toContain("source=tiktok");
    expect((init?.headers as Record<string, string>).apikey).toBe("test-key");
  });

  it("parses creator handle and follower reach from video activity_text", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        activities: [
          {
            source: "tiktok",
            activity_text: "New video by longngusi1 (2401 Followers)",
            activity_type: "video",
            activity_date: "2026-06-17",
            activity_tier: 4,
          },
          {
            source: "tiktok",
            activity_text: "New video by madshot ✪ (103K Followers)",
            activity_type: "video",
            activity_date: "2026-05-31",
            activity_tier: 2,
          },
          {
            source: "tiktok",
            activity_text: "New video by bigcreator (1.2M Followers)",
            activity_type: "video",
            activity_date: "2026-05-24",
            activity_tier: 1,
          },
        ],
      }),
    );

    const creators = await getTikTokCreators("ISRC123");

    expect(creators).toEqual(
      expect.arrayContaining([
        { handle: "longngusi1", market: null, reach: 2401 },
        { handle: "madshot ✪", market: null, reach: 103_000 },
        { handle: "bigcreator", market: null, reach: 1_200_000 },
      ]),
    );
    expect(creators).toHaveLength(3);
  });

  it("dedupes a creator that posted multiple videos, keeping the highest reach", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        activities: [
          {
            activity_text: "New video by repeat (10K Followers)",
            activity_type: "video",
          },
          {
            activity_text: "New video by repeat (12K Followers)",
            activity_type: "video",
          },
        ],
      }),
    );

    const creators = await getTikTokCreators("ISRC123");

    expect(creators).toEqual([{ handle: "repeat", market: null, reach: 12_000 }]);
  });

  it("skips non-video activities and unparseable rows", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        activities: [
          { activity_text: "Added to a playlist", activity_type: "playlist" },
          { activity_type: "video" }, // no text
          {
            activity_text: "New video by realcreator (5K Followers)",
            activity_type: "video",
          },
        ],
      }),
    );

    const creators = await getTikTokCreators("ISRC123");

    expect(creators).toEqual([
      { handle: "realcreator", market: null, reach: 5_000 },
    ]);
  });

  it("returns an empty array when the track has no tiktok activity", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ activities: [], track_info: {} }));

    await expect(getTikTokCreators("ISRC123")).resolves.toEqual([]);
  });

  it("throws when SONGSTATS_API_KEY is unset", async () => {
    delete process.env.SONGSTATS_API_KEY;
    await expect(getTikTokCreators("ISRC123")).rejects.toThrow(
      "SONGSTATS_API_KEY",
    );
  });
});
