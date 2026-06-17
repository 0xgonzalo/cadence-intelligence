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

/**
 * Synthesize `text` into spoken audio (mp3 bytes). `lang` (ISO code) drives the
 * multilingual model's pronunciation; omit it to let the model auto-detect.
 * TTS can take longer than a normal request, so the timeout is widened.
 */
export async function tts(
  text: string,
  voiceId: string = DEFAULT_VOICE_ID,
  lang?: string,
): Promise<Uint8Array> {
  const body: Record<string, unknown> = {
    text,
    model_id: MULTILINGUAL_MODEL,
  };
  if (lang) body.language_code = lang;

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
