import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

type IntelRow = {
  themes: string[] | null;
  mood: string | null;
  language: string | null;
} | null;

export default async function CatalogPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tracks")
    .select("id, title, isrc, track_intelligence(themes, mood, language)")
    .order("title", { ascending: true });

  const tracks = (data ?? []).map((t) => {
    const intel = (t.track_intelligence as IntelRow) ?? null;
    return {
      id: t.id,
      title: t.title ?? t.isrc ?? "Untitled track",
      mood: intel?.mood ?? null,
      language: intel?.language ?? null,
      themes: (intel?.themes ?? []).slice(0, 3),
      analyzed: intel !== null,
    };
  });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            Catalog Intelligence
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Your tracks, decoded
          </h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Themes, mood and language derived live from Musixmatch + Cyanite —
            no lyrics stored. Open a track for its energy curve and clip map.
          </p>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {tracks.length} track{tracks.length === 1 ? "" : "s"}
        </span>
      </div>

      {error ? (
        <p className="mt-8 font-mono text-sm text-destructive">
          Could not load catalog: {error.message}
        </p>
      ) : tracks.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          No tracks yet. Onboard an artist with ISRCs to populate the catalog.
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tracks.map((t) => (
            <Link key={t.id} href={`/catalog/${t.id}`} className="group">
              <Card className="h-full p-5 transition-colors hover:border-foreground/30">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold leading-tight tracking-tight">
                    {t.title}
                  </h3>
                  {t.analyzed ? (
                    t.mood ? (
                      <Badge variant="solid">{t.mood}</Badge>
                    ) : null
                  ) : (
                    <Badge variant="outline">Unanalyzed</Badge>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {t.themes.map((theme) => (
                    <Badge key={theme} variant="default">
                      {theme}
                    </Badge>
                  ))}
                  {t.language ? (
                    <Badge variant="outline">{t.language}</Badge>
                  ) : null}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
