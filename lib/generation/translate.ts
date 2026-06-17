/**
 * Localization for generated brief copy.
 *
 * NOTE ON THE PARTNER CHOICE: the plan slots localization under "Musixmatch
 * translations", but Musixmatch's translation API is *lyric*-scoped — it returns
 * translated lyric lines for a track, which we must never persist. The brief
 * copy we localize here is our own ORIGINAL marketing text (no lyric content),
 * so it is translated through the already-wired AI Gateway instead. This keeps
 * the hard compliance rule intact: no raw Musixmatch lyric text ever flows
 * through (or is stored by) this path.
 *
 * Degrades gracefully: returns the source text if the gateway is unavailable.
 */
import { generateText } from "ai";
import { model } from "@/lib/ai";

const SYSTEM_PROMPT = [
  "You are a professional localizer for music-marketing copy.",
  "Translate the user's text into the target language, preserving tone, hashtags, @mentions, emoji and line breaks.",
  "Output only the translation — no preamble, no quotes, no notes.",
].join(" ");

/**
 * Translate a single copy string into `targetLang` (e.g. "pt", "es"). Empty or
 * whitespace-only input is returned unchanged.
 */
export async function translate(
  text: string,
  targetLang: string,
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;

  try {
    const { text: out } = await generateText({
      model: model(),
      system: SYSTEM_PROMPT,
      prompt: `Target language: ${targetLang}\n\n${trimmed}`,
    });
    return out.trim() || text;
  } catch {
    // Gateway unavailable / no key — fall back to the source copy.
    return text;
  }
}
