import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchWithTimeout } from "@/lib/http";
import { assertSnippetAllowed } from "@/lib/compliance/lyrics";
import {
  matchTrack,
  getAnalysis,
  getHookSnippet,
  getRichsync,
  searchArtists,
  getArtistTracks,
} from "@/lib/partners/musixmatch";

vi.mock("@/lib/http", () => ({ fetchWithTimeout: vi.fn() }));
const mockFetch = vi.mocked(fetchWithTimeout);

/** Wrap a Musixmatch `body` in the standard `message` envelope as a Response. */
function mxmResponse(body: unknown, status_code = 200): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ message: { header: { status_code }, body } }),
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
  process.env.MUSIXMATCH_API_KEY = "test-key";
});

describe("musixmatch adapter", () => {
  describe("compliance", () => {
    it("returns a hook snippet that passes the <15-word guard", async () => {
      mockFetch.mockResolvedValue(
        mxmResponse({ snippet: { snippet_body: "We were dancing in the dark" } }),
      );

      const snippet = await getHookSnippet("123");

      expect(snippet).toBe("We were dancing in the dark");
      expect(() => assertSnippetAllowed(snippet)).not.toThrow();
    });

    it("caps an over-long hook to fewer than 15 words", async () => {
      const long = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");
      mockFetch.mockResolvedValue(
        mxmResponse({ snippet: { snippet_body: long } }),
      );

      const snippet = await getHookSnippet("123");

      expect(snippet.split(/\s+/).filter(Boolean).length).toBeLessThan(15);
      expect(() => assertSnippetAllowed(snippet)).not.toThrow();
    });

    it("never persists richsync text — returns it for live timing only", async () => {
      const richsync_body = JSON.stringify([
        { ts: 1.0, te: 2.5, x: "first line", l: [] },
        { ts: 2.5, te: 4.0, x: "second line", l: [] },
      ]);
      mockFetch.mockResolvedValue(mxmResponse({ richsync: { richsync_body } }));

      const lines = await getRichsync("123");

      expect(lines).toEqual([
        { start: 1.0, end: 2.5, text: "first line" },
        { start: 2.5, end: 4.0, text: "second line" },
      ]);
    });
  });

  describe("matchTrack", () => {
    it("resolves an mxm track id by isrc", async () => {
      mockFetch.mockResolvedValue(mxmResponse({ track: { track_id: 998877 } }));

      const id = await matchTrack({ isrc: "USabc1234567" });

      expect(id).toBe("998877");
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("/matcher.track.get");
      expect(calledUrl).toContain("track_isrc=USabc1234567");
    });

    it("returns null when Musixmatch has no match", async () => {
      mockFetch.mockResolvedValue(mxmResponse("", 404));

      expect(await matchTrack({ isrc: "NONE" })).toBeNull();
    });

    it("requires an isrc or a title+artist pair", async () => {
      await expect(matchTrack({ title: "Solo Title" })).rejects.toThrow(
        /isrc or a title\+artist/,
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("getAnalysis", () => {
    it("derives themes from genres and surfaces mood/language", async () => {
      mockFetch.mockResolvedValue(
        mxmResponse({
          track: {
            primary_genres: {
              music_genre_list: [
                { music_genre: { music_genre_name: "Pop" } },
                { music_genre: { music_genre_name: "Dance" } },
              ],
            },
            mood: "uplifting",
            language: "en",
          },
        }),
      );

      const analysis = await getAnalysis("123");

      expect(analysis.themes).toEqual(["Pop", "Dance"]);
      expect(analysis.mood).toBe("uplifting");
      expect(analysis.language).toBe("en");
    });

    it("backfills the ISRC from track.get, normalized to upper case", async () => {
      mockFetch.mockResolvedValue(
        mxmResponse({ track: { track_isrc: "usnew1234567" } }),
      );

      const analysis = await getAnalysis("123");

      expect(analysis.isrc).toBe("USNEW1234567");
    });

    it("tolerates a sparse response", async () => {
      mockFetch.mockResolvedValue(mxmResponse({ track: {} }));

      const analysis = await getAnalysis("123");

      expect(analysis).toEqual({
        themes: [],
        mood: null,
        language: null,
        isrc: null,
      });
    });
  });

  describe("searchArtists", () => {
    it("resolves artists by name", async () => {
      mockFetch.mockResolvedValue(
        mxmResponse({
          artist_list: [
            {
              artist: {
                artist_id: 118827,
                artist_name: "Phoebe Bridgers",
                artist_country: "US",
              },
            },
            { artist: { artist_id: 200, artist_name: "Phoebe Other" } },
          ],
        }),
      );

      const artists = await searchArtists("phoebe bridgers");

      expect(artists).toEqual([
        { artistId: "118827", name: "Phoebe Bridgers", country: "US" },
        { artistId: "200", name: "Phoebe Other", country: null },
      ]);
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("/artist.search");
      expect(calledUrl).toContain("q_artist=phoebe+bridgers");
    });

    it("returns [] when Musixmatch has no match", async () => {
      mockFetch.mockResolvedValue(mxmResponse("", 404));

      expect(await searchArtists("zzzznotanartist")).toEqual([]);
    });
  });

  describe("getArtistTracks", () => {
    it("returns an artist's top tracks with title + isrc", async () => {
      mockFetch.mockResolvedValue(
        mxmResponse({
          track_list: [
            {
              track: {
                track_id: 998877,
                track_name: "Motion Sickness",
                track_isrc: "USajaja",
              },
            },
            {
              track: {
                track_id: 998878,
                track_name: "Kyoto",
                track_isrc: "usbjbjb",
              },
            },
          ],
        }),
      );

      const tracks = await getArtistTracks("118827", 3);

      expect(tracks).toEqual([
        { mxmTrackId: "998877", title: "Motion Sickness", isrc: "USAJAJA" },
        { mxmTrackId: "998878", title: "Kyoto", isrc: "USBJBJB" },
      ]);
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("/track.search");
      expect(calledUrl).toContain("f_artist_id=118827");
      expect(calledUrl).toContain("s_track_rating=desc");
      expect(calledUrl).toContain("page_size=3");
    });

    it("defaults isrc to null when Musixmatch omits it", async () => {
      mockFetch.mockResolvedValue(
        mxmResponse({
          track_list: [
            { track: { track_id: 5, track_name: "No ISRC Here" } },
          ],
        }),
      );

      expect(await getArtistTracks("118827")).toEqual([
        { mxmTrackId: "5", title: "No ISRC Here", isrc: null },
      ]);
    });

    it("returns [] when the artist has no tracks", async () => {
      mockFetch.mockResolvedValue(mxmResponse("", 404));

      expect(await getArtistTracks("118827")).toEqual([]);
    });
  });

  describe("auth", () => {
    it("throws when MUSIXMATCH_API_KEY is unset", async () => {
      delete process.env.MUSIXMATCH_API_KEY;

      await expect(matchTrack({ isrc: "USabc1234567" })).rejects.toThrow(
        "MUSIXMATCH_API_KEY",
      );
    });
  });
});
