/**
 * ElevenLabs adapter — text-to-speech for faceless voiceover and multilingual
 * dubbing of generated copy.
 *
 * Base/auth follow the ElevenLabs API (https://api.elevenlabs.io/v1,
 * `xi-api-key` header). The request shape is documentation-derived and has NOT
 * been confirmed against a live call (no ELEVENLABS_API_KEY was available at
 * build time). See Task 4.2 in the plan.
 *
 * COMPLIANCE: the `text` passed here is generated brief copy or a compliant
 * (< 15-word) hook snippet — never a raw lyric body.
 */
import { fetchWithTimeout } from "@/lib/http";

const BASE_URL = "https://api.elevenlabs.io/v1";

/** ElevenLabs' default "Rachel" voice — a safe fallback when none is chosen. */
export const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

const MULTILINGUAL_MODEL = "eleven_multilingual_v2";

function requireApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  return key;
}

/** ElevenLabs `voice_settings` — controls delivery for a TTS render. */
export interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  speed: number;
}

/** Emotion presets an artist can pick for the voiceover. Each maps to the
 *  ElevenLabs `voice_settings` that shape delivery: low stability + high style
 *  reads as energetic/expressive; high stability + low style reads as calm. */
export type Emotion = "hype" | "warm" | "calm" | "neutral";

export const EMOTION_PRESETS: Record<Emotion, VoiceSettings> = {
  hype: { stability: 0.3, similarity_boost: 0.75, style: 0.85, speed: 1.05 },
  warm: { stability: 0.55, similarity_boost: 0.8, style: 0.45, speed: 1.0 },
  calm: { stability: 0.8, similarity_boost: 0.75, style: 0.15, speed: 0.95 },
  neutral: { stability: 0.5, similarity_boost: 0.75, style: 0.3, speed: 1.0 },
};

export function isEmotion(v: unknown): v is Emotion {
  return typeof v === "string" && v in EMOTION_PRESETS;
}

/**
 * Synthesize `text` into spoken audio (mp3 bytes). `lang` (ISO code) drives the
 * multilingual model's pronunciation; omit it to let the model auto-detect.
 * NOTE: the model does not TRANSLATE — pass already-translated text for a
 * non-source language. `opts.voiceSettings` shapes emotional delivery.
 * TTS can take longer than a normal request, so the timeout is widened.
 */
export async function tts(
  text: string,
  voiceId: string = DEFAULT_VOICE_ID,
  lang?: string,
  opts?: { voiceSettings?: VoiceSettings; modelId?: string },
): Promise<Uint8Array> {
  const body: Record<string, unknown> = {
    text,
    model_id: opts?.modelId ?? MULTILINGUAL_MODEL,
  };
  if (lang) body.language_code = lang;
  if (opts?.voiceSettings) body.voice_settings = opts.voiceSettings;

  const res = await fetchWithTimeout(
    `${BASE_URL}/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": requireApiKey(),
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify(body),
    },
    45_000,
  );
  if (!res.ok) {
    throw new Error(
      `ElevenLabs tts failed: ${res.status} ${res.statusText}`,
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Generate a sound effect (mp3 bytes) from a text description via the
 * ElevenLabs Sound Generation API (`POST /v1/sound-generation`). Useful for
 * risers, stings, and transitions to layer under teaser clips. `duration` is
 * clamped to the API's 0.5–30s window; `loop` makes it seamlessly loopable.
 * COMPLIANCE: `prompt` is a user/AI description, never a lyric body.
 */
export async function soundEffect(
  prompt: string,
  opts?: { durationSeconds?: number; loop?: boolean },
): Promise<Uint8Array> {
  const body: Record<string, unknown> = {
    text: prompt,
    prompt_influence: 0.3,
  };
  if (opts?.durationSeconds != null) {
    body.duration_seconds = Math.min(30, Math.max(0.5, opts.durationSeconds));
  }
  if (opts?.loop != null) body.loop = opts.loop;

  const res = await fetchWithTimeout(
    `${BASE_URL}/sound-generation`,
    {
      method: "POST",
      headers: {
        "xi-api-key": requireApiKey(),
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify(body),
    },
    45_000,
  );
  if (!res.ok) {
    throw new Error(
      `ElevenLabs sound-generation failed: ${res.status} ${res.statusText}`,
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}
