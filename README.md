# CADENCE — Autonomous Content Intelligence for Music

CADENCE is an **autonomous content-intelligence platform for music artists and labels**.
A persistent agent watches an artist's catalog momentum and, *without being prompted*,
produces content intelligence and ready-to-use multiformat assets — localized to the
market where the artist is growing — and surfaces ideal collaborators to amplify reach.

It is **not** a video editor. It is the *decision layer* that comes before editing:
**what** to make, about **which** song, with **which** hook, for **whom**, **when**, and
**who** to collaborate with. The flow runs from intelligence through asset generation and
stops before publishing — it delivers a finished **Content Package**; external publishing
is out of scope.

> Built for the Musixmatch Musicathon (June 2026). The Musixmatch Pro API is the mandated
> intelligence core of the platform.

---

## How it works — the autonomous loop

CADENCE doesn't wait to be asked. A persistent agent (orchestrated in **n8n** or Vercel
Cron) runs this loop on a schedule:

```
WATCH  →  DETECT  →  ANALYZE  →  GENERATE  →  PACKAGE  →  SURFACE
```

1. **WATCH / DETECT** — Poll Songstats momentum for every track in the catalog. When a
   track crosses an acceleration threshold (or a JamBase event / new market appears), raise
   a **Content Opportunity**. (`lib/signal/poll.ts`, `lib/signal/momentum.ts`)
2. **ANALYZE** — Pull live Musixmatch analysis (themes, mood, language, hook line) + Cyanite
   energy curve, and pick the most clippable window. (`lib/agent/loop.ts`, `lib/intelligence/clip.ts`)
3. **GENERATE** — An LLM turns insight into a multiformat brief + copy (hook, script,
   captions, beat-by-beat plan), localized into the rising market's language via Musixmatch
   translations. (`lib/generation/brief.ts`, `lib/generation/translate.ts`)
4. **PACKAGE** — Produce concrete assets: ElevenLabs voiceover, LALAL.AI stems, and a
   Musixmatch richsync lyric-clip window. Stored in a private bucket behind signed URLs.
5. **SURFACE** — Rank collaborator leads (TikTok creators already using the artist's or
   similar music) and draft outreach DMs. (`lib/collab/rank.ts`)

Every stage boundary is written to an `agent_log` table so the **control room** can show a
live activity feed — the evidence of autonomy. The whole per-opportunity pipeline lives in
`lib/agent/loop.ts → runOpportunity()`.

---

## Product modules (UI)

| Route | Module | What it shows |
|-------|--------|---------------|
| `/radar` | **Content Radar** (home) | Active opportunities the agent detected — which track is rising, why, in which market, and package status. |
| `/catalog`, `/catalog/[trackId]` | **Catalog Intelligence** | Per-track performance + themes/mood + energy curve + clip map + localization gaps. |
| `/engine/[opportunityId]` | **Content Engine** | The generated brief, multiformat + multilingual copy, on-demand asset generation, downloadable package preview. |
| `/collab/[opportunityId]` | **Collab Radar** | Ranked fitting creators + why they fit + agent-drafted outreach. |
| `/agent` | **The Agent** (control room) | Configure thresholds/cadence/brand voice, live activity log, weekly plan. |
| `/onboard`, `/roster` | **Onboarding / Roster** | Connect an artist by name (Musixmatch search) and manage the roster. |

---

## Partner / API integrations

Each partner owns a specific link in the chain — no filler. Every adapter lives in
`lib/partners/` and fails loudly (throws if its key is missing) so a degraded provider is
visible rather than silently mocked.

| Partner | Role in CADENCE | Adapter | Auth / Base URL |
|---------|-----------------|---------|-----------------|
| **Musixmatch** | Intelligence core: track matching, lyrical themes/mood/language, hook detection, translations, richsync lyric clips | `lib/partners/musixmatch.ts` | `apikey` query param · `https://api.musixmatch.com/ws/1.1` |
| **Songstats** | Momentum signal: streams/creates/Shazams growth, top markets, TikTok creators as warm collab leads | `lib/partners/songstats.ts` | `apikey` header · `https://api.songstats.com/enterprise/v1` |
| **Cyanite** | Clippable moment (energy curve time-series), mood/genre/BPM, sonic similarity for the collab pool | `lib/partners/cyanite.ts` | `Authorization: Bearer` · GraphQL at `https://api.cyanite.ai/graphql` |
| **ElevenLabs** | Voice: faceless voiceover + multilingual dubbing of generated copy | `lib/partners/elevenlabs.ts` | `xi-api-key` · `https://api.elevenlabs.io/v1` |
| **LALAL.AI** | Audio prep: stems (instrumental / acapella / isolated hook) from uploaded source audio | `lib/partners/lalal.ts` | `Authorization: license` · `https://www.lalal.ai/api` |
| **JamBase** | Event-driven trigger: tour dates / setlists / venues for local market targeting | `lib/partners/jambase.ts` | `apikey` query param · `https://www.jambase.com/jb-api/v1` |
| **Vercel AI Gateway** | LLM access for briefs, copy, outreach, ranking heuristics | `lib/ai.ts` | `AI_GATEWAY_API_KEY` (AI SDK v6 default provider) |
| **n8n** | Orchestration: schedules the loop, watches thresholds, compiles the weekly plan | `n8n/cadence-agent.json` | Webhooks gated by `CRON_SECRET` |

### How each integration is wired

- **Musixmatch** (`lib/partners/musixmatch.ts`) — Calls go through a shared `mxmGet()` helper
  that reads the `message`-envelope response and throws on a non-2xx `status_code`. Exposes
  `matchTrack` (ISRC/title → mxm id), `searchArtists` / `searchArtistCandidates` /
  `getArtistTracks` (onboarding picker), `getAnalysis` (themes/mood/language), `getHookSnippet`,
  and `getRichsync`. **Compliance is enforced here:** hook snippets pass through
  `assertSnippetAllowed` (< 15 words) and richsync lyrics are returned for in-flight use only —
  never persisted (see [Data & compliance](#data-model--compliance)).

- **Songstats** (`lib/partners/songstats.ts`) — `getTrackStats(isrc)` returns momentum signals
  that `lib/signal/momentum.ts` diffs to detect acceleration; `getTrackAudienceMarkets(isrc)`
  drives localization/market targeting; `getTikTokCreators(isrc)` seeds the collab pool.

- **Cyanite** (`lib/partners/cyanite.ts`) — A small GraphQL client. `analyzeTrack(isrc)` returns
  BPM + an energy-curve array that `lib/intelligence/clip.ts → pickClipWindow()` scans for the
  peak/drop to clip; `similarTracks(trackId)` widens the creator pool to adjacent music.

- **ElevenLabs** (`lib/partners/elevenlabs.ts`) — `tts(text, voiceId, lang)` returns audio bytes
  for faceless voiceover; the loop uploads them to the private `packages` bucket and mints a
  short-lived signed URL.

- **LALAL.AI** (`lib/partners/lalal.ts`) — Async split flow: `uploadAudio` → `requestSplit` →
  `pollSplit`/`checkSplit`. Only runs when the user has uploaded source audio (the autonomous run
  skips stems since it has no source file).

- **JamBase** (`lib/partners/jambase.ts`) — `getEvents(artistName)` provides event-driven content
  triggers and local-market targeting.

- **LLM via Vercel AI Gateway** (`lib/ai.ts`) — All generation routes through the gateway using
  AI SDK v6's `generateObject` with a plain `"provider/model"` string (no provider package needed).
  Default model is `anthropic/claude-haiku-4.5` — reachable on the gateway free tier; Sonnet/Opus
  return 403 without paid credits. Override with `CADENCE_AI_MODEL`. `classifyGatewayError` maps
  429/403 into clean user-facing messages.

> **Note:** several partner adapters were built from API documentation in environments where the
> live key wasn't available, so their response schemas are intentionally loose (`safeParse`,
> `.passthrough()`). Run a live smoke call and tighten field mapping when wiring a real key.

---

## Tech stack

- **Frontend:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4.
  Aesthetic: dark-luxury / digital-brutalism.
- **Backend:** Next.js route handlers + server actions.
- **Database / Auth / Storage:** Supabase (Postgres, magic-link auth, private Storage bucket).
- **AI:** Vercel AI Gateway via AI SDK v6 (`ai`), schemas validated with Zod v4.
- **Orchestration:** n8n workflow (or Vercel Cron) hitting the app's cron-gated endpoints.
- **Tests:** Vitest (unit) + Playwright (e2e).

> ⚠️ This repo runs a **modified build of Next.js** — APIs and conventions can differ from
> stock Next 16. See `AGENTS.md`; consult `node_modules/next/dist/docs/` before changing
> framework-level code.

---

## Data model & compliance

The Musixmatch Pro Terms forbid persisting lyric content. This is a **hard rule baked into the
data layer**, not a guideline:

- **Stored (derived, non-lyric only):** Songstats numbers, Cyanite tags, derived analysis labels
  (e.g. `theme = "defiance"`, `mood = "euphoric"`), generated briefs/plans, schedules, artist
  profile, agent config.
- **Never stored:** raw Musixmatch lyric text. Hooks are fetched live, capped under 15 words by
  `lib/compliance/lyrics.ts`, and used in-flight only. Richsync produces **timing windows + a line
  count** — the lyric text itself is never written to any table or cache.

Postgres tables (`supabase/migrations/`): `artists`, `tracks`, `track_signals`,
`track_intelligence`, `content_opportunities`, `briefs`, `content_packages`, `collab_leads`,
`agent_config`, `agent_log`, `weekly_plans`. Generated assets live in the **private** `packages`
storage bucket, reachable only through short-lived signed URLs.

---

## Getting started

### 1. Prerequisites
- Node.js 20+ and npm
- A Supabase project (the `cadence` project, or your own)
- API keys for the partners you want to exercise (the app degrades gracefully when a key is absent)

### 2. Configure environment
Copy the example and fill in values:

```bash
cp .env.local.example .env.local
```

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | Service client for the agent loop / cron (bypasses RLS) |
| `NEXT_PUBLIC_SITE_URL` | Base URL for magic-link callbacks |
| `CADENCE_AUTH_ALLOWLIST` | Comma-separated emails / `@domain` entries allowed to sign in |
| `CRON_SECRET` | Bearer token gating the autonomous endpoints |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway key |
| `CADENCE_AI_MODEL` | *(optional)* override the gateway model slug |
| `MUSIXMATCH_API_KEY` `SONGSTATS_API_KEY` `CYANITE_API_KEY` `ELEVENLABS_API_KEY` `LALAL_API_KEY` `JAMBASE_API_KEY` | Partner APIs |
| `N8N_WEBHOOK_URL`, `N8N_SHARED_SECRET` | n8n automation |

### 3. Set up the database
```bash
npm run db:push      # apply migrations to the linked Supabase project
npm run db:types     # regenerate lib/supabase/types.ts (optional)
```

### 4. Run the app
```bash
npm install
npm run dev          # http://localhost:3000
```

### 5. Use it
1. **Sign in** at `/auth/login` with a magic link (your email must be in `CADENCE_AUTH_ALLOWLIST`).
2. **Onboard an artist** at `/onboard` — search by name (Musixmatch), confirm the right artist
   from the enriched cards, and pick tracks. CADENCE indexes the catalog (no lyrics persisted).
3. **Detect opportunities** — hit **Refresh signals** on `/radar` (a session-gated WATCH+DETECT
   tick) or let the scheduled agent run.
4. **Open the Content Engine** for an opportunity to view/generate the brief, copy, and assets.
5. **Check Collab Radar** for ranked creators and outreach drafts.
6. **Configure the agent** at `/agent` and watch the live log as the autonomous loop runs.

---

## API endpoints

**Session-gated** (Supabase auth — used by the UI):

| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/api/artists` | Onboard an artist + catalog |
| `GET`  | `/api/catalog` | Catalog with intelligence |
| `POST` | `/api/intelligence/[trackId]` | Run/refresh per-track intelligence |
| `POST` | `/api/generate` | Generate a brief for an opportunity |
| `POST` | `/api/collab` | Build the collab radar for an opportunity |
| `POST` | `/api/assets`, `/api/assets/upload` | Generate / upload package assets |
| `GET`/`POST` | `/api/agent/config` | Read/update agent configuration |
| `POST` | `/api/signal/run` | Manual "Refresh signals" tick |

**Cron-gated** (`Authorization: Bearer ${CRON_SECRET}` — driven by n8n / Vercel Cron):

| Method | Route | Loop stage |
|--------|-------|------------|
| `POST` | `/api/signal/poll` | WATCH + DETECT across all catalogs |
| `POST` | `/api/agent/run` | Run the newest opportunity end-to-end |
| `POST` | `/api/agent/weekly` | Compile + push the weekly plan |
| `POST` | `/api/assets/cleanup` | Expire stale generated assets |

> `/api/agent/run` accepts **both** auth paths: a `Bearer ${CRON_SECRET}` request runs across
> every catalog (cron/n8n), while a signed-in session scopes the run to that user.

---

## Orchestration (n8n / Cron)

`n8n/cadence-agent.json` is an importable workflow. On a schedule (default every 6h) it calls
the three cron endpoints in order — `signal/poll` → `agent/run` → `agent/weekly` — each with the
shared `Bearer ${CRON_SECRET}`. It needs two n8n env vars: `APP_BASE_URL` and `CRON_SECRET`
(matching the app). If n8n is unavailable, a Vercel Cron hitting the same three endpoints with the
same secret is a drop-in fallback.

---

## Testing

```bash
npm test             # Vitest unit tests (lib/, partners, generation, compliance)
npm run test:watch
npm run test:e2e     # Playwright
npm run lint
```
