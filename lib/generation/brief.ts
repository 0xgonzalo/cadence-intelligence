/**
 * Brief + multiformat copy generator.
 *
 * Turns a detected opportunity + a track's derived intelligence into a
 * platform-native content brief via the gateway model. The live hook snippet
 * (display-only, < 15 words) is passed as *inspiration* and forced through the
 * compliance guard before it ever reaches the prompt; the generated `hook` is
 * the model's own original line, never a verbatim lyric. Nothing here persists
 * raw lyric content.
 */
import { z } from "zod";
import { generateStructured } from "@/lib/ai";
import { assertSnippetAllowed } from "@/lib/compliance/lyrics";
import type { Track, ContentOpportunity, SignalDelta } from "@/lib/domain/types";

/** The platform formats every brief produces copy for. */
export const FORMAT_KEYS = [
  "reel",
  "tiktok",
  "short",
  "lyricVideo",
  "staticPost",
  "carousel",
  "faceless",
] as const;

export type FormatKey = (typeof FORMAT_KEYS)[number];

/** A single timed beat in a content piece's shot list. */
export const ContentBeatSchema = z.object({
  time: z
    .string()
    .describe(
      'The timecode or position for this beat. Video → a seconds window like "0–3s" or "3–8s"; carousel → "Slide 1"; static post → "Frame".',
    ),
  label: z
    .string()
    .describe(
      'Two-or-three word name for the beat, e.g. "Hook", "Build", "Reveal", "Payoff", "CTA".',
    ),
  action: z
    .string()
    .describe(
      "Concrete, shootable direction — exactly what is on screen, said, or shown in this beat.",
    ),
});

/** The detailed, per-platform plan for one content piece. */
export const FormatPlanSchema = z.object({
  concept: z
    .string()
    .describe(
      "One vivid sentence describing what THIS specific piece of content is.",
    ),
  whyItWorks: z
    .string()
    .describe(
      "Why this content is valuable right now: tie it to the momentum signal, the target market, and the platform behaviour it exploits. 1–2 sentences.",
    ),
  beats: z
    .array(ContentBeatSchema)
    .min(1)
    .describe(
      "The timed structure as an ordered shot list. The FIRST beat is the hook and MUST state its timing. Cover the full arc through to the call-to-action. A single-frame static post may have just one beat.",
    ),
  captions: z
    .array(z.string())
    .min(1)
    .describe(
      "1–3 ready-to-post caption options tailored to this format and market (include hashtags where natural).",
    ),
});

export const BriefCopySchema = z.object({
  hook: z
    .string()
    .describe(
      "An original, scroll-stopping hook line under 15 words. Inspired by the song — never a verbatim copy of any lyric.",
    ),
  angle: z
    .string()
    .describe("The single creative angle this content push leans into."),
  formats: z
    .object({
      reel: FormatPlanSchema,
      tiktok: FormatPlanSchema,
      short: FormatPlanSchema,
      lyricVideo: FormatPlanSchema,
      staticPost: FormatPlanSchema,
      carousel: FormatPlanSchema,
      faceless: FormatPlanSchema,
    })
    .describe("Platform-tailored content plan, one per format."),
  script: z
    .string()
    .describe(
      "The spoken voiceover narration for the video formats (reel / tiktok / short / faceless), written as continuous speech the creator reads aloud. It MUST deliver THIS brief: open on the hook, carry the chosen angle through the key on-screen beats, and close on the call-to-action. Roughly 40–60 words (~20 seconds), in the target market language. Original copy only — never read song lyrics.",
    ),
});

export type ContentBeat = z.infer<typeof ContentBeatSchema>;
export type FormatPlan = z.infer<typeof FormatPlanSchema>;
export type BriefCopy = z.infer<typeof BriefCopySchema>;

/** Derived, persist-safe intelligence the generator reads (no lyric text). */
export interface BriefIntelligence {
  themes: string[];
  mood: string | null;
  language: string | null;
  bpm: number | null;
  clipStartMs: number | null;
  clipEndMs: number | null;
  visualMood: string | null;
}

export interface BriefInput {
  /** The catalog track, or null for an event-driven (live-show) signal. */
  track: Pick<Track, "title" | "isrc"> | null;
  /** Artist name — used to frame the subject when there is no track. */
  artistName?: string | null;
  intelligence: BriefIntelligence;
  opportunity: Pick<ContentOpportunity, "market" | "language" | "reason"> & {
    signalDelta?: SignalDelta;
  };
  brandVoice?: string | null;
  /** Live, display-only lyric hook (< 15 words). Inspiration only — not stored. */
  hookSnippet?: string | null;
}

/**
 * Per-format playbook: the platform timing rules and structural expectations
 * the model must respect. Fed into the prompt so every plan is shootable and
 * platform-native rather than generic.
 */
const FORMAT_GUIDE: Record<FormatKey, string> = {
  reel: "Instagram Reel · vertical 9:16 · 15–30s. Land the hook in the first 3 seconds; close on a clear CTA.",
  tiktok:
    "TikTok · vertical 9:16 · 15–45s. Native and fast — hook in the first 2 seconds, no slow intro.",
  short:
    "YouTube Short · vertical 9:16 · under 60s. Cold open immediately; deliver the payoff before 50s.",
  lyricVideo:
    "Lyric video clip · 15–30s. Kinetic on-screen text synced to the beat — original paraphrased lines only, never the verbatim lyric.",
  staticPost:
    "Single static image post · one frame. The hook and value must read in under 2 seconds.",
  carousel:
    "Carousel · 5–7 slides. Slide 1 is the hook; every slide earns the swipe; the final slide is the CTA.",
  faceless:
    "Faceless · B-roll / text-over-video, no creator on camera. Voiceover or captions carry it; hook in the first 3 seconds.",
};

function clipWindowLabel(intel: BriefIntelligence): string | null {
  if (intel.clipStartMs == null || intel.clipEndMs == null) return null;
  const s = (intel.clipStartMs / 1000).toFixed(1).replace(/\.0$/, "");
  const e = (intel.clipEndMs / 1000).toFixed(1).replace(/\.0$/, "");
  return `${s}s–${e}s`;
}

/**
 * Pure prompt builder. Embeds the rising market, theme/mood angle inputs, the
 * clip window, the brand voice and the (compliance-checked) anchor hook, plus
 * the format list. Throws if the supplied hook is not display-allowed.
 */
export function buildBriefPrompt(input: BriefInput): string {
  const { track, intelligence: intel, opportunity: opp, brandVoice } = input;
  const hook = input.hookSnippet
    ? assertSnippetAllowed(input.hookSnippet)
    : null;

  const lines: string[] = [];
  if (track) {
    lines.push(
      `Track: "${track.title}"${track.isrc ? ` (ISRC ${track.isrc})` : ""}.`,
    );
  } else {
    lines.push(
      `Subject: ${input.artistName ?? "the artist"} — this is a live-show moment, not a single track. Promote the upcoming concert and the artist's catalog for fans in this market.`,
    );
  }
  lines.push(
    `Rising market: ${opp.market}${
      opp.language ? ` (target language ${opp.language})` : ""
    }.`,
  );
  if (opp.reason) lines.push(`Why now: ${opp.reason}.`);
  if (intel.themes.length) lines.push(`Themes: ${intel.themes.join(", ")}.`);
  if (intel.mood) lines.push(`Mood: ${intel.mood}.`);
  if (intel.bpm) lines.push(`Tempo: ${Math.round(intel.bpm)} BPM.`);
  if (intel.visualMood) lines.push(`Visual mood: ${intel.visualMood}.`);
  const clip = clipWindowLabel(intel);
  if (clip) lines.push(`Best clip window: ${clip}.`);
  if (brandVoice) lines.push(`Brand voice: ${brandVoice}.`);
  if (hook) {
    lines.push(
      `Anchor hook line (display-only, < 15 words — do not reproduce verbatim): "${hook}".`,
    );
  }
  const playbook = FORMAT_KEYS.map((f) => `- ${f}: ${FORMAT_GUIDE[f]}`);

  return [
    "Create a content brief that turns this catalog momentum into a multiformat content package.",
    "",
    ...lines,
    "",
    "For EACH format produce a precise, shootable plan:",
    "- concept: what this specific piece of content actually is.",
    "- why it works: why this content is valuable for the artist right now, tied to the momentum signal, the market and the platform behaviour it exploits.",
    "- a timed beat-by-beat structure that follows the platform's time rules — the first beat is the hook and MUST state its timing.",
    "- 1–3 captions tailored to that format and market.",
    "Be specific to each format — do not repeat the same plan across formats.",
    "",
    "Then write the shared brief essentials:",
    "- hook: one original, scroll-stopping line (under 15 words) every format can open on.",
    "- angle: the single creative angle every format leans into.",
    "- script: the spoken voiceover narration for the video formats. Write it as continuous speech the creator reads aloud — open on the hook, carry the angle through the key beats, and close on the call-to-action. Roughly 40–60 words (~20 seconds), in the target market language. It must voice THIS brief, not generic filler. Original copy only — never read song lyrics.",
    "",
    "Format playbook (respect these time rules and structures):",
    ...playbook,
  ].join("\n");
}

const SYSTEM_PROMPT = [
  "You are CADENCE's content strategist for music marketing.",
  "You turn catalog momentum into ready-to-shoot, platform-native content.",
  "Every format gets a precise, shootable plan: a concept, a reason it is valuable right now, a timed beat-by-beat structure that obeys the platform's time rules, and tailored captions.",
  "Output original copy only — never reproduce song lyrics. Any hook must be your own line and fewer than 15 words.",
  "Match the brand voice exactly and localize tone to the target market.",
].join(" ");

/**
 * Generate the multiformat brief copy for an opportunity. Builds the prompt and
 * calls the gateway model with the structured schema.
 */
export async function generateBrief(input: BriefInput): Promise<BriefCopy> {
  return generateStructured({
    schema: BriefCopySchema,
    system: SYSTEM_PROMPT,
    prompt: buildBriefPrompt(input),
  });
}

const LOCALIZE_SYSTEM = [
  "You are a professional localizer for music-marketing content briefs.",
  "Translate every human-readable string into the target language, preserving meaning, tone, hashtags, @mentions and emoji.",
  'Keep every timecode (e.g. "0–3s", "Slide 1") and the JSON structure exactly as given.',
  "Do not invent, add or drop content — only translate what is provided.",
].join(" ");

/**
 * Localize an entire brief into `lang` in a single structured pass (one gateway
 * call, not field-by-field). Degrades gracefully to the source copy if the
 * gateway is unavailable, so generation never fails on a missing translation.
 */
export async function localizeBriefCopy(
  copy: BriefCopy,
  lang: string,
): Promise<BriefCopy> {
  try {
    return await generateStructured({
      schema: BriefCopySchema,
      system: LOCALIZE_SYSTEM,
      prompt: `Target language: ${lang}\n\n${JSON.stringify(copy)}`,
    });
  } catch {
    return copy;
  }
}

/** The persisted, per-format `copy` payload for a single brief row. */
export function briefRowCopy(copy: BriefCopy, format: FormatKey) {
  const plan = copy.formats[format];
  return {
    hook: copy.hook,
    angle: copy.angle,
    concept: plan.concept,
    whyItWorks: plan.whyItWorks,
    beats: plan.beats,
    captions: plan.captions,
    script: copy.script,
  };
}
