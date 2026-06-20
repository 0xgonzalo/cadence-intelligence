/**
 * JamBase adapter — upcoming live events (tour dates/venues) for an artist.
 * Used by the signal poll to raise *event-driven* content opportunities (a show
 * in a target market is a reason to publish), complementing momentum triggers.
 *
 * Base/auth follow the JamBase v3 API (https://api.data.jambase.com/v3, API key
 * as `Authorization: Bearer <key>`, JSON-LD-style event payloads). The response
 * shape below is confirmed against a live call: events come back under an
 * `events` envelope as schema.org Event objects (`name`, `startDate`,
 * `location` → Place with `name` + `address`, `addressCountry` a Country
 * object). The schema stays loose (`.passthrough()`, optional envelopes) so
 * shape drift won't throw.
 *
 * Only derived event metadata (name, date, venue, market) is returned — no
 * Musixmatch lyric content is involved here.
 */
import { z } from "zod";
import { fetchWithTimeout } from "@/lib/http";

const BASE_URL = "https://api.data.jambase.com/v3";

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

// Only the fields the mapping reads are declared; everything else (addressRegion,
// postalCode, x-* extensions) passes through unvalidated. v3 sometimes sends
// addressRegion as an object ({}), so declaring it as a string would throw.
const AddressSchema = z
  .object({
    addressCountry: CountrySchema.optional(),
    addressLocality: z.string().optional(),
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
  url.searchParams.set("artistName", artistName);
  url.searchParams.set("eventType", "concert");
  url.searchParams.set("perPage", "100");

  const res = await fetchWithTimeout(url.toString(), {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${requireApiKey()}`,
    },
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
