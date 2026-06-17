/**
 * Shared domain types — the app-facing (camelCase) shapes that flow between
 * adapters, the signal/intelligence/generation layers, and the UI. These mirror
 * the derived-data tables in `supabase/migrations` (never raw lyric content).
 */

export interface Track {
  id: string;
  artistId: string;
  isrc: string | null;
  title: string;
  mxmTrackId: string | null;
  createdAt?: string;
}

/** A single point-in-time metric reading for a track (one `track_signals` row). */
export interface MomentumSignal {
  trackId: string;
  metric: string;
  value: number;
  market: string;
  capturedAt: string;
  source?: string;
}

/** Tunable detection knobs, stored per artist in `agent_config.thresholds`. */
export interface Thresholds {
  /** Min fractional growth between the two latest captures to raise an op (0.5 = +50%). */
  accelerationPct: number;
}

/** The delta that justified an opportunity — persisted to `content_opportunities.signal_delta`. */
export interface SignalDelta {
  metric: string;
  market: string;
  from: number;
  to: number;
  pct: number;
  fromAt: string;
  toAt: string;
}

export type OpportunityStatus = "new" | "in_progress" | "ready" | "dismissed";

export interface ContentOpportunity {
  id?: string;
  artistId?: string;
  trackId: string;
  reason: string;
  market: string;
  language?: string | null;
  status: OpportunityStatus;
  signalDelta: SignalDelta;
  detectedAt?: string;
}

export interface Brief {
  id?: string;
  opportunityId: string;
  format: string;
  angle?: string | null;
  market?: string | null;
  language?: string | null;
  copy: unknown;
  createdAt?: string;
}

export type PackageStatus = "draft" | "ready" | "delivered";

export interface ContentPackage {
  id?: string;
  opportunityId: string;
  status: PackageStatus;
  assets: Record<string, unknown>;
  createdAt?: string;
}

export interface CollabLead {
  id?: string;
  opportunityId: string;
  handle: string;
  source?: string | null;
  market?: string | null;
  fitScore?: number | null;
  reach?: number | null;
  rationale?: string | null;
  outreachDraft?: string | null;
  createdAt?: string;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface AgentLogEntry {
  id?: string;
  artistId: string;
  level: LogLevel;
  phase?: string | null;
  message: string;
  payload?: unknown;
  createdAt?: string;
}

export interface AgentConfig {
  id?: string;
  artistId: string;
  cadence?: string | null;
  thresholds: Thresholds;
  formats: string[];
  brandVoice?: string | null;
  pushTargets?: unknown;
}
