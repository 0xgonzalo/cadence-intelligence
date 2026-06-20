/**
 * Songstats exposes metrics as raw snake_case API keys (`charted_countries_total`,
 * `streams_total`, …) that flow untouched into signal deltas. Those keys must
 * never reach the UI — this maps the common ones to human labels and falls back
 * to a generic prettifier (drop noisy suffixes, snake_case → Sentence case) so
 * an unknown key still reads cleanly instead of leaking a variable name.
 */
const METRIC_LABELS: Record<string, string> = {
  charted_countries_total: "Charted countries",
  charted_countries: "Charted countries",
  streams_total: "Total streams",
  streams_current: "Streams",
  spotify_streams_total: "Spotify streams",
  spotify_popularity_current: "Spotify popularity",
  popularity_current: "Popularity",
  playlists_total: "Playlist adds",
  playlist_reach_total: "Playlist reach",
  shazams_total: "Shazams",
  tiktok_videos_total: "TikTok videos",
  tiktok_views_total: "TikTok views",
  tiktok_likes_total: "TikTok likes",
  youtube_views_total: "YouTube views",
  soundcloud_streams_total: "SoundCloud plays",
  apple_music_playlists_total: "Apple Music playlists",
};

export function metricLabel(metric: string): string {
  if (!metric) return "Signal";
  const known = METRIC_LABELS[metric.toLowerCase()];
  if (known) return known;
  const cleaned = metric
    .toLowerCase()
    .replace(/_(total|current|count|value|all_time)$/g, "")
    .replace(/_/g, " ")
    .trim();
  if (!cleaned) return metric;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** The one-line "why" for a momentum opportunity, with a human metric label. */
export function momentumReason(
  metric: string,
  pct: number,
  market: string | null,
): string {
  return `${metricLabel(metric)} +${Math.round(pct * 100)}% in ${market ?? "global"}`;
}
