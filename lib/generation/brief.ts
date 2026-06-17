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
      reel: z.string(),
      tiktok: z.string(),
      short: z.string(),
      lyricVideo: z.string(),
      staticPost: z.string(),
      carousel: z.string(),
      faceless: z.string(),
    })
    .describe("Platform-tailored copy, one draft per format."),
  captions: z
    .array(z.string())
    .describe("2–4 ready-to-post caption options for the target market."),
  script: z
    .string()
    .describe("A short voiceover / script for the video formats."),
});

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
  track: Pick<Track, "title" | "isrc">;
  intelligence: BriefIntelligence;
  opportunity: Pick<ContentOpportunity, "market" | "language" | "reason"> & {
    signalDelta?: SignalDelta;
  };
  brandVoice?: string | null;
  /** Live, display-only lyric hook (< 15 words). Inspiration only — not stored. */
  hookSnippet?: string | null;
}

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
  lines.push(
    `Track: "${track.title}"${track.isrc ? ` (ISRC ${track.isrc})` : ""}.`,
  );
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
  lines.push(`Produce platform-tailored copy for: ${FORMAT_KEYS.join(", ")}.`);

  return [
    "Create a content brief that turns this catalog momentum into a multiformat content package.",
    "",
    ...lines,
  ].join("\n");
}

const SYSTEM_PROMPT = [
  "You are CADENCE's content strategist for music marketing.",
  "You turn catalog momentum into ready-to-shoot, platform-native content.",
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
