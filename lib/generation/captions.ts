/**
 * Caption-card generation — short, ready-to-post social captions auto-drafted
 * from an opportunity's existing signal context (Songstats momentum or a
 * JamBase live-show trigger). No audio upload required; this turns the data we
 * already store into shareable content.
 *
 * COMPLIANCE: captions are ORIGINAL marketing composition — no lyric content
 * flows through this path, so no snippet/compliance guard is needed.
 */
import { z } from "zod";
import { generateStructured } from "@/lib/ai";
import { metricLabel } from "@/lib/signal/metric-label";

export const CaptionCardSchema = z.object({
  platform: z
    .string()
    .describe("Target platform/format, e.g. Instagram, TikTok, X."),
  caption: z.string().describe("The ready-to-post caption text."),
  hashtags: z.array(z.string()).describe("3–6 relevant hashtags, no # needed."),
});
export type CaptionCard = z.infer<typeof CaptionCardSchema>;

const CaptionSetSchema = z.object({
  cards: z.array(CaptionCardSchema),
});

export interface CaptionInput {
  kind: "momentum" | "show";
  reason: string | null;
  market: string | null;
  language: string | null;
  signalDelta: { metric?: string; from?: number; to?: number; pct?: number } | null;
  trackTitle: string | null;
  artistName: string | null;
}

export function buildCaptionPrompt(input: CaptionInput): string {
  const lines: string[] = [];
  if (input.artistName) lines.push(`Artist: ${input.artistName}`);
  if (input.kind === "momentum") {
    if (input.trackTitle) lines.push(`Track: "${input.trackTitle}"`);
    const d = input.signalDelta;
    if (d?.metric && Number.isFinite(d.pct)) {
      const pct = Math.round((d.pct ?? 0) * 100);
      lines.push(
        `Milestone: ${metricLabel(d.metric)} up ${pct}%` +
          (d.from != null && d.to != null ? ` (${d.from} → ${d.to})` : ""),
      );
    }
    lines.push("This is a streaming/chart momentum moment to celebrate.");
  } else {
    lines.push("This is an upcoming live-show / tour moment.");
  }
  if (input.reason) lines.push(`Context: ${input.reason}`);
  if (input.market) lines.push(`Market: ${input.market}`);
  if (input.language) lines.push(`Write the captions in language: ${input.language}`);
  return lines.join("\n");
}

/** Generate ~3 platform-flavored caption cards for one opportunity. */
export async function generateCaptionCards(
  input: CaptionInput,
): Promise<CaptionCard[]> {
  const { cards } = await generateStructured({
    schema: CaptionSetSchema,
    system:
      "You are a social-media strategist for music artists. Write 3 short, " +
      "punchy, ready-to-post captions for the moment described — one each for " +
      "Instagram, TikTok, and X (Twitter). Match the artist's celebratory or " +
      "anticipatory tone. Keep captions tight and platform-appropriate. Do not " +
      "invent specific numbers beyond what is given.",
    prompt: buildCaptionPrompt(input),
  });
  return cards;
}
