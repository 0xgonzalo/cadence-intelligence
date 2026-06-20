import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchWithTimeout } from "@/lib/http";
import { getEvents } from "@/lib/partners/jambase";

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

// Far enough in the future / past that the test stays deterministic over time.
const FUTURE = "2099-09-01T20:00:00Z";
const PAST = "2000-01-01T20:00:00Z";

beforeEach(() => {
  mockFetch.mockReset();
  process.env.JAMBASE_API_KEY = "test-key";
});

describe("jambase adapter", () => {
  it("throws when JAMBASE_API_KEY is unset", async () => {
    delete process.env.JAMBASE_API_KEY;
    await expect(getEvents("Artist")).rejects.toThrow("JAMBASE_API_KEY");
  });

  it("sends the api key and artist name, returns upcoming events", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        events: [
          {
            name: "Live at the Forum",
            startDate: FUTURE,
            location: {
              name: "The Forum",
              address: {
                addressLocality: "Los Angeles",
                addressCountry: { identifier: "US", name: "United States" },
              },
            },
          },
        ],
      }),
    );

    const events = await getEvents("Boygenius");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/events");
    expect(url).toContain("Boygenius");
    expect(url).toContain("eventType=concert");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe("Bearer test-key");
    expect(events).toEqual([
      {
        name: "Live at the Forum",
        date: FUTURE,
        venue: "The Forum",
        city: "Los Angeles",
        market: "US",
      },
    ]);
  });

  it("filters out past events and sorts upcoming soonest-first", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        events: [
          {
            name: "Later show",
            startDate: "2099-12-01T20:00:00Z",
            location: { address: { addressCountry: "GB" } },
          },
          { name: "Old show", startDate: PAST, location: {} },
          {
            name: "Sooner show",
            startDate: FUTURE,
            location: { address: { addressCountry: "GB" } },
          },
        ],
      }),
    );

    const events = await getEvents("Artist");

    expect(events.map((e) => e.name)).toEqual(["Sooner show", "Later show"]);
  });

  it("derives market from a plain-string addressCountry", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        events: [
          {
            name: "Show",
            startDate: FUTURE,
            location: { address: { addressCountry: "mx" } },
          },
        ],
      }),
    );

    const events = await getEvents("Artist");
    expect(events[0].market).toBe("MX");
  });

  it("throws on a non-2xx response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    } as unknown as Response);

    await expect(getEvents("Artist")).rejects.toThrow(/503/);
  });
});
