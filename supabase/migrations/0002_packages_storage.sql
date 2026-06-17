-- CADENCE asset storage — the `packages` bucket holds generated Content Package
-- audio (stems, voiceover) plus lyric-derived clip media.
--
-- COMPLIANCE: objects here are EPHEMERAL. Lyric-derived clips are generated
-- on-demand and the cleanup cron (app/api/assets/cleanup) deletes objects older
-- than a short window. No lyric TEXT is ever stored — only audio bytes and
-- non-lyric metadata (timing windows) live here / in content_packages.assets.
--
-- The bucket is PRIVATE: reads/writes go through the service-role client, which
-- mints short-lived signed URLs for the browser. No public or authenticated
-- storage policies are added, so nothing is reachable without a signed URL.
-- Idempotent: safe to re-run.

insert into storage.buckets (id, name, public)
values ('packages', 'packages', false)
on conflict (id) do nothing;
