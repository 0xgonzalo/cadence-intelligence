-- CADENCE initial schema — derived, non-lyric data only.
-- HARD RULE: no table here may store raw Musixmatch lyric content.
-- Hook lines / richsync are fetched live and used ephemerally (see lib/compliance/lyrics.ts).
-- Idempotent: safe to re-run. RLS isolates rows per owning user via artists.user_id;
-- the service_role (agent endpoints) bypasses RLS through its BYPASSRLS attribute.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.artists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  spotify_url text,
  created_at  timestamptz not null default now()
);

create table if not exists public.tracks (
  id           uuid primary key default gen_random_uuid(),
  artist_id    uuid not null references public.artists (id) on delete cascade,
  isrc         text,
  title        text not null,
  mxm_track_id text,
  created_at   timestamptz not null default now()
);

create table if not exists public.track_signals (
  id          uuid primary key default gen_random_uuid(),
  track_id    uuid not null references public.tracks (id) on delete cascade,
  source      text not null,
  metric      text not null,
  value       numeric not null,
  market      text,
  captured_at timestamptz not null default now(),
  unique (track_id, source, metric, market, captured_at)
);

-- Derived intelligence only. NO lyric text columns — derived labels + curves.
create table if not exists public.track_intelligence (
  track_id     uuid primary key references public.tracks (id) on delete cascade,
  themes       text[] not null default '{}',
  mood         text,
  language     text,
  bpm          numeric,
  energy_curve jsonb,
  clip_start_ms integer,
  clip_end_ms   integer,
  visual_mood  text,
  updated_at   timestamptz not null default now()
);

create table if not exists public.content_opportunities (
  id           uuid primary key default gen_random_uuid(),
  artist_id    uuid not null references public.artists (id) on delete cascade,
  track_id     uuid references public.tracks (id) on delete set null,
  reason       text,
  market       text,
  language     text,
  status       text not null default 'new'
                 check (status in ('new', 'in_progress', 'ready', 'dismissed')),
  signal_delta jsonb,
  detected_at  timestamptz not null default now()
);

create table if not exists public.briefs (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.content_opportunities (id) on delete cascade,
  format         text not null,
  angle          text,
  market         text,
  language       text,
  copy           jsonb,
  created_at     timestamptz not null default now()
);

create table if not exists public.content_packages (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.content_opportunities (id) on delete cascade,
  status         text not null default 'draft'
                   check (status in ('draft', 'ready', 'delivered')),
  assets         jsonb not null default '{}',
  created_at     timestamptz not null default now()
);

create table if not exists public.collab_leads (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.content_opportunities (id) on delete cascade,
  handle         text not null,
  source         text,
  market         text,
  fit_score      numeric,
  reach          numeric,
  rationale      text,
  outreach_draft text,
  created_at     timestamptz not null default now()
);

create table if not exists public.agent_config (
  id           uuid primary key default gen_random_uuid(),
  artist_id    uuid not null unique references public.artists (id) on delete cascade,
  cadence      text,
  thresholds   jsonb,
  formats      text[] not null default '{}',
  brand_voice  text,
  push_targets jsonb
);

create table if not exists public.agent_log (
  id         uuid primary key default gen_random_uuid(),
  artist_id  uuid not null references public.artists (id) on delete cascade,
  level      text not null default 'info'
               check (level in ('debug', 'info', 'warn', 'error')),
  phase      text,
  message    text not null,
  payload    jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.weekly_plans (
  id         uuid primary key default gen_random_uuid(),
  artist_id  uuid not null references public.artists (id) on delete cascade,
  week_start date not null,
  plan       jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes (foreign keys + RLS-filter columns + hot query paths)
-- ---------------------------------------------------------------------------

create index if not exists artists_user_id_idx              on public.artists (user_id);
create index if not exists tracks_artist_id_idx             on public.tracks (artist_id);
create index if not exists track_signals_track_id_idx       on public.track_signals (track_id);
create index if not exists track_signals_lookup_idx         on public.track_signals (track_id, metric, market, captured_at desc);
create index if not exists content_opportunities_artist_idx on public.content_opportunities (artist_id);
create index if not exists content_opportunities_track_idx  on public.content_opportunities (track_id);
create index if not exists briefs_opportunity_id_idx        on public.briefs (opportunity_id);
create index if not exists content_packages_opportunity_idx on public.content_packages (opportunity_id);
create index if not exists collab_leads_opportunity_id_idx  on public.collab_leads (opportunity_id);
create index if not exists agent_log_artist_created_idx     on public.agent_log (artist_id, created_at desc);
create index if not exists weekly_plans_artist_id_idx       on public.weekly_plans (artist_id);

-- ---------------------------------------------------------------------------
-- Ownership helpers (SECURITY DEFINER, private schema) — resolve nested
-- ownership through one indexed lookup instead of repeating joins per policy.
-- Each checks the calling user's identity internally.
-- ---------------------------------------------------------------------------

create schema if not exists private;

create or replace function private.user_owns_artist(target uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.artists a
    where a.id = target and a.user_id = (select auth.uid())
  );
$$;

create or replace function private.user_owns_track(target uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.tracks t
    join public.artists a on a.id = t.artist_id
    where t.id = target and a.user_id = (select auth.uid())
  );
$$;

create or replace function private.user_owns_opportunity(target uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.content_opportunities o
    join public.artists a on a.id = o.artist_id
    where o.id = target and a.user_id = (select auth.uid())
  );
$$;

revoke execute on function private.user_owns_artist(uuid)      from public, anon;
revoke execute on function private.user_owns_track(uuid)       from public, anon;
revoke execute on function private.user_owns_opportunity(uuid) from public, anon;
grant execute on function private.user_owns_artist(uuid)      to authenticated;
grant execute on function private.user_owns_track(uuid)       to authenticated;
grant execute on function private.user_owns_opportunity(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security: enable + owner-scoped policies (authenticated role).
-- ---------------------------------------------------------------------------

alter table public.artists               enable row level security;
alter table public.tracks                enable row level security;
alter table public.track_signals         enable row level security;
alter table public.track_intelligence    enable row level security;
alter table public.content_opportunities enable row level security;
alter table public.briefs                enable row level security;
alter table public.content_packages      enable row level security;
alter table public.collab_leads          enable row level security;
alter table public.agent_config          enable row level security;
alter table public.agent_log             enable row level security;
alter table public.weekly_plans          enable row level security;

drop policy if exists artists_owner on public.artists;
create policy artists_owner on public.artists
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists tracks_owner on public.tracks;
create policy tracks_owner on public.tracks
  for all to authenticated
  using (private.user_owns_artist(artist_id))
  with check (private.user_owns_artist(artist_id));

drop policy if exists track_signals_owner on public.track_signals;
create policy track_signals_owner on public.track_signals
  for all to authenticated
  using (private.user_owns_track(track_id))
  with check (private.user_owns_track(track_id));

drop policy if exists track_intelligence_owner on public.track_intelligence;
create policy track_intelligence_owner on public.track_intelligence
  for all to authenticated
  using (private.user_owns_track(track_id))
  with check (private.user_owns_track(track_id));

drop policy if exists content_opportunities_owner on public.content_opportunities;
create policy content_opportunities_owner on public.content_opportunities
  for all to authenticated
  using (private.user_owns_artist(artist_id))
  with check (private.user_owns_artist(artist_id));

drop policy if exists briefs_owner on public.briefs;
create policy briefs_owner on public.briefs
  for all to authenticated
  using (private.user_owns_opportunity(opportunity_id))
  with check (private.user_owns_opportunity(opportunity_id));

drop policy if exists content_packages_owner on public.content_packages;
create policy content_packages_owner on public.content_packages
  for all to authenticated
  using (private.user_owns_opportunity(opportunity_id))
  with check (private.user_owns_opportunity(opportunity_id));

drop policy if exists collab_leads_owner on public.collab_leads;
create policy collab_leads_owner on public.collab_leads
  for all to authenticated
  using (private.user_owns_opportunity(opportunity_id))
  with check (private.user_owns_opportunity(opportunity_id));

drop policy if exists agent_config_owner on public.agent_config;
create policy agent_config_owner on public.agent_config
  for all to authenticated
  using (private.user_owns_artist(artist_id))
  with check (private.user_owns_artist(artist_id));

drop policy if exists agent_log_owner on public.agent_log;
create policy agent_log_owner on public.agent_log
  for all to authenticated
  using (private.user_owns_artist(artist_id))
  with check (private.user_owns_artist(artist_id));

drop policy if exists weekly_plans_owner on public.weekly_plans;
create policy weekly_plans_owner on public.weekly_plans
  for all to authenticated
  using (private.user_owns_artist(artist_id))
  with check (private.user_owns_artist(artist_id));
