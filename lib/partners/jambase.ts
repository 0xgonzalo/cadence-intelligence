/**
 * JamBase adapter — upcoming live events (tour dates/venues) for an artist.
 * Used by the signal poll to raise *event-driven* content opportunities (a show
 * in a target market is a reason to publish), complementing momentum triggers.
 *
 * Base/auth follow the JamBase API (https://www.jambase.com/jb-api/v1, `apikey`
 * query param, JSON-LD-style event payloads). The response *shape* below is
 * documentation-derived and has NOT been confirmed against a live call (no
 * JAMBASE_API_KEY was available at build time). The schema is intentionally
 * loose (`.passthrough()`, optional envelopes) so a real response won't throw on
 * shape drift; run a live smoke call and tighten the field mapping once the key
 * is set. See Task 7.1 in the plan.
 *
 * Only derived event metadata (name, date, venue, market) is returned — no
 * Musixmatch lyric content is involved here.
 */
import { z } from "zod";
import { fetchWithTimeout } from "@/lib/http";

const BASE_URL = "https://www.jambase.com/jb-api/v1";

function requireApiKey(): string {
  const key = process.env.JAMBASE_API_KEY;
  if (!key) throw new Error("JAMBASE_API_KEY is not set");
  return key;
}

// addressCountry is either an ISO string ("US") or a JSON-LD Country object
// ({ "@type": "Country", identifier: "US", name: "United States" }).
const CountrySchema = z.union([
  z.string(),
  z
    .object({ identifier: z.string().optional(), name: z.string().optional() })
    .passthrough(),
]);

const AddressSchema = z
  .object({
    addressCountry: CountrySchema.optional(),
    addressLocality: z.string().optional(),
    addressRegion: z.string().optional(),
  })
  .passthrough();

const PlaceSchema = z
  .object({
    name: z.string().optional(),
    address: AddressSchema.optional(),
  })
  .passthrough();

const EventSchema = z
  .object({
    name: z.string().optional(),
    startDate: z.string().optional(),
    location: z.union([PlaceSchema, z.array(PlaceSchema)]).optional(),
  })
  .passthrough();

const EventsEnvelopeSchema = z
  .object({
    events: z.array(EventSchema).optional(),
    data: z.array(EventSchema).optional(),
  })
  .passthrough();

type ParsedEvent = z.infer<typeof EventSchema>;

/** A single upcoming live event, normalized to derived metadata. */
export interface UpcomingEvent {
  name: string;
  /** ISO 8601 start date/time. */
  date: string;
  venue: string | null;
  city: string | null;
  /** ISO country code (uppercased) where the event is held, or null. */
  market: string | null;
}

function marketFrom(country: z.infer<typeof CountrySchema> | undefined): string | null {
  if (!country) return null;
  const code = typeof country === "string" ? country : country.identifier;
  return code ? code.toUpperCase() : null;
}

function toUpcomingEvent(ev: ParsedEvent): UpcomingEvent | null {
  if (!ev.startDate) return null;
  const place = Array.isArray(ev.location) ? ev.location[0] : ev.location;
  return {
    name: ev.name ?? "Live event",
    date: ev.startDate,
    venue: place?.name ?? null,
    city: place?.address?.addressLocality ?? null,
    market: marketFrom(place?.address?.addressCountry),
  };
}

/**
 * Upcoming events for `artistName`, soonest-first. Past events are dropped so
 * callers only ever see actionable future shows.
 */
export async function getEvents(artistName: string): Promise<UpcomingEvent[]> {
  const url = new URL(`${BASE_URL}/events`);
  url.searchParams.set("apikey", requireApiKey());
  url.searchParams.set("artistName", artistName);
  url.searchParams.set("eventType", "concerts");

  const res = await fetchWithTimeout(url.toString(), {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(
      `JamBase /events failed: ${res.status} ${res.statusText}`,
    );
  }

  const parsed = EventsEnvelopeSchema.parse(await res.json());
  const rows = parsed.events ?? parsed.data ?? [];
  const now = Date.now();

  return rows
    .map(toUpcomingEvent)
    .filter((e): e is UpcomingEvent => {
      if (!e) return false;
      const t = Date.parse(e.date);
      return Number.isFinite(t) && t >= now;
    })
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}
