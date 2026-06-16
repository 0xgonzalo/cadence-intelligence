# CADENCE — Product Requirements Document

> **Working title:** CADENCE *(alternatives: SONAR, PULSE, RIFF, RESONANCE)*
> **Context:** Musixmatch Musicathon (June 15–21, 2026)
> **Hard requirement:** The Musixmatch Pro API must be the core intelligence engine of the platform.
> **This document is the build brief. Build it in the phase order defined in §9.**

---

## 1. Product summary

CADENCE is an **autonomous content intelligence platform for music artists and labels**. A persistent agent watches an artist's catalog momentum and, without being prompted, produces content intelligence and ready-to-use multiformat assets — localized to the market where the artist is growing — and surfaces ideal collaborators to amplify reach.

It is **not** a video editor. It is the *decision layer* that comes before editing: what to make, about which song, with which hook, for whom, when, and who to collaborate with.

The platform's flow runs from **intelligence through asset generation**. It stops before publishing — it delivers a finished Content Package; external publishing is out of scope.

### Design priorities (in order)
1. **Autonomous agent that runs on its own** — the soul of the product.
2. **Deep catalog intelligence** — the core differentiator.
3. **Quality/aesthetics of generated content.**
4. **Conscious use of the full partner stack.**

---

## 2. Users and modes

| Mode | User | Focus |
|------|------|-------|
| **Artist** | Independent artist / manager | One catalog, deep. Personal content copilot. |
| **Label** | Label / distributor | Multi-artist. Prioritizes effort across roster by momentum. |

Build **Artist mode** first, with a visible toggle to **Label mode** (a roster grid that reuses the same engine). Architecture is identical; Label mode is Artist × N plus a roster-ranking layer.

---

## 3. The Autonomous Agent (north star)

CADENCE does not wait to be asked. It is a persistent agent (orchestrated in **n8n**) running this loop:

```
WATCH  →  DETECT  →  ANALYZE  →  GENERATE  →  PACKAGE  →  SURFACE
```

**Behavior:**
- Polls the catalog's momentum signals (Songstats) at a configurable cadence.
- When a track crosses an acceleration threshold (or a JamBase event appears, or a new market takes off), it raises a **Content Opportunity**.
- For each opportunity it runs the full intelligence + generation pipeline.
- It deposits a ready **Content Package** in the user's inbox (briefs + assets + collab leads).
- It compiles an automatic **weekly plan** and presents it as a digestible brief, with optional push to Discord/Slack/email.

The agent control room must expose a **live log** of agent activity (required for demonstrating autonomy).

---

## 4. Layered architecture

Build CADENCE as six modular layers. Each partner owns a specific link with no filler.

### Layer 1 — SIGNAL
**Partners: Songstats + JamBase**
- Songstats: streams, TikTok creates, Shazams, playlist placements, per-track growth, top markets, audience demographics.
- JamBase: tour dates, setlists, venues → event-driven content triggers.
- **Output:** a prioritized event stream — which track is rising, in which market, why, what event is coming.

### Layer 2 — INTELLIGENCE
**Partners: Musixmatch (Analysis) + Cyanite**
- Musixmatch Analysis: lyrical themes, mood, language, and detection of hook lines (short, quotable, viral-leaning phrases).
- Cyanite: mood/genre/BPM + **energy curves** (time-series) → identifies the clippable moment (peak/drop) of each track + suggested visual style.
- **Output:** per track — the lyrical hook, the segment to clip, the creative angle, the visual mood.

### Layer 3 — GENERATION
**Partners: n8n (AI agent nodes) + Musixmatch (translations) + LLM**
- The agent turns insight into **content briefs** and drafts: captions, scripts, concepts, hooks.
- Localization via Musixmatch translations: the same brief adapted to the language of the market Songstats flagged as growing.
- Multiformat: Reel/TikTok/Short, lyric video, static post, carousel, faceless content with voiceover.
- **Output:** an actionable brief + ready copy, in N languages.

### Layer 4 — ASSET
**Partners: LALAL.AI + ElevenLabs + Musixmatch (richsync)**
- LALAL.AI: stems → instrumental for the Reel, acapella for lyric-driven content, isolated hook.
- ElevenLabs: voiceover/narration for faceless content, multilingual dubbing of the copy.
- Musixmatch richsync: word-level synced lyric clips.
- **Output:** the concrete assets of the Content Package (audio, voiceover, lyric clip, visual base).

### Layer 5 — COLLAB
**Partners: Songstats + Cyanite + Musixmatch (+ external connector)**
- Songstats TikTok creates → who already makes content with the artist's music = warm leads.
- Cyanite similarity → sonically similar tracks → expands the pool to creators using adjacent music.
- Musixmatch themes → matches creator content values to the song's values (Creator-Artist Values Match).
- Ranking by: market overlap (Songstats geography), reach, fit.
- **Known data gap:** deep creator profiles/contact/demographics are not native to the partner stack. For now, use what Songstats exposes; the deep CRM layer (TikTok Creator Marketplace, Modash) is an external connector to be added later. Do **not** fabricate creator data — only use what the integrated APIs actually return.
- **Output:** a **Collab Radar** — creators already orbiting the artist's sound, ranked by fit and reach in their rising markets.

### Layer 6 — ORCHESTRATION
**Partner: n8n**
- Runs the agent loop, schedules, monitors thresholds, compiles the weekly plan, and prepares everything for handoff. The platform **stops before publishing** — it delivers the package; external push (e.g., Postiz, Meta API) is out of scope.

---

## 5. Product modules (UI)

### 5.1 Content Radar (home)
First screen. Shows active Content Opportunities the agent detected:
- Which track is rising and **why** (Songstats delta).
- The lyrical hook that is resonating.
- In which market/language.
- Status: new / in progress / package ready.

### 5.2 Catalog Intelligence
Deep catalog view. Per track:
- Performance (Songstats) + themes/mood (Musixmatch) + energy curve (Cyanite).
- "Clip map": where the most clippable moments are.
- Audience languages vs. available translations (localization gap).
- Lyric asset health (synced? translated?).

### 5.3 Content Engine
Where an opportunity is materialized:
- Generated brief (angle, hook, format, market, language).
- Multiformat + multilingual copy drafts.
- On-demand asset generation (stems, voiceover, lyric clip).
- Downloadable Content Package preview.

### 5.4 Collab Radar
- Ranked list of fitting creators (see Layer 5).
- Per creator: why they fit (which of your/adjacent music they use, which market, which values).
- Agent-generated outreach draft (optional).

### 5.5 The Agent (control room)
- Configure thresholds, cadence, preferred formats, brand voice.
- Live agent activity log (required).
- Auto-generated weekly plan + optional push to Discord/Slack/email.

---

## 6. Partner integration map

| Partner | Irreplaceable role | Layer |
|---------|--------------------|-------|
| **Musixmatch** | Lyric material, themes/mood (Analysis), localization (translations), lyric clips (richsync), UGC detection (fingerprint) | 2,3,4,5 |
| **Songstats** | Momentum signal, market/language/demographics, creates as collab leads | 1,5 |
| **Cyanite** | Clippable moment (energy curves), style (mood), sonic similarity for collab pool | 2,5 |
| **ElevenLabs** | Voice: faceless voiceover, multilingual dubbing of copy | 4 |
| **LALAL.AI** | Audio prep: stems (instrumental/acapella/hook) | 4 |
| **JamBase** | Event-driven content trigger + local market targeting | 1 |
| **n8n** | The autonomous agent: orchestration, generation, scheduling | 3,6 |

---

## 7. Data model & compliance constraints

The Musixmatch Pro API Terms (and the Musicathon rules) forbid persisting Musixmatch content and prohibit commercial use. This **shapes the data model**:

**Store (derived / non-lyric only):**
- Songstats numbers, Cyanite tags, public creator metrics.
- Generated briefs and plans, schedules, artist profile, agent configuration.
- Derived analysis labels (e.g., theme = "defiance", mood = "euphoric").

**Never persist:**
- Raw Musixmatch lyric content. Fetch it **live**, use snippets **under 15 words** in any displayed copy, and generate assets **on-demand** and ephemerally.

Implement this as a hard rule in the data layer: no table or cache should ever store full lyric text from Musixmatch.

---

## 8. Recommended tech stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind. Aesthetic: dark-luxury / digital-brutalism.
- **Backend:** Next.js server actions + route handlers.
- **Database:** Supabase (Postgres) — only for permitted derived data (see §7). pgvector optional for creator/track matching embeddings.
- **Orchestration / Agent:** n8n (self-hosted or cloud) with webhooks to/from the app; AI agent nodes for generation.
- **LLM:** Anthropic API (Claude) for briefs, copy, outreach, heuristic ranking.
- **Partner APIs:** Musixmatch Pro (Scale plan), Songstats, Cyanite, ElevenLabs, LALAL.AI, JamBase.
- **Auth:** Supabase Auth (magic link).
- **Deploy:** Vercel (app) + n8n hosted separately.

---

## 9. Build phases

Build in this order for coherence and a demonstrable checkpoint at each step.

- **Phase 1 — Skeleton + Signal.** Next.js app, auth, connect an artist, integrate Songstats, render Content Radar with real momentum data. (Also validates Musixmatch Pro Scale + Songstats API keys work.)
- **Phase 2 — Intelligence.** Musixmatch matching + Analysis + Cyanite tags/curves. Catalog Intelligence view working.
- **Phase 3 — Generation.** LLM briefs + multiformat copy + translations. Content Engine producing real briefs.
- **Phase 4 — Assets.** LALAL stems + ElevenLabs voiceover + richsync lyric clip. Downloadable Content Package.
- **Phase 5 — Collab Radar.** Creator pool (Songstats + Cyanite similarity + Musixmatch themes) + ranking + outreach draft.
- **Phase 6 — The Agent (n8n).** Orchestration, thresholds, autonomous loop, weekly plan, push to Discord.
- **Phase 7 — Polish.** Aesthetics, real demo data (a real artist), end-to-end test.

**Minimum demonstrable slice that implies the whole platform:** Phases 1–3 + Phase 6 (the agent running, even if it only generates briefs). Assets and Collab Radar can be shown partially.

---

## 10. End-to-end user flow

1. **Onboarding:** user connects an artist (Spotify URL / ISRCs). CADENCE indexes the catalog (Musixmatch matching + Songstats metrics + Cyanite tags — all derived, no lyrics persisted).
2. **Agent setup:** configure cadence, thresholds, brand voice, preferred formats.
3. **Autonomous detection:** the agent runs, detects a Content Opportunity (e.g., track rising in BR, lyrical hook X).
4. **Pipeline:** generates a multiformat brief + copy in PT + selects the clip via energy curve + prepares stems + ElevenLabs voiceover + richsync lyric clip.
5. **Collab Radar:** surfaces ranked Brazilian creators already using the artist's or similar music, with an outreach draft.
6. **Package:** everything lands in the inbox, ready to record/download/use.
7. **Weekly plan:** the agent compiles the week and pushes it to Discord.

---

## 11. Acceptance criteria

- The Musixmatch Pro API is integrated and actively used as the intelligence core (mandatory).
- The agent can run unprompted and produce at least one complete Content Package end-to-end.
- No raw Musixmatch lyric content is persisted anywhere in storage.
- At least Musixmatch + Songstats + Cyanite + n8n are integrated and functional; ElevenLabs, LALAL.AI, and JamBase integrated where their layer is built.
- A live agent log is visible in the control room.
- The app runs with real data for at least one real artist.
