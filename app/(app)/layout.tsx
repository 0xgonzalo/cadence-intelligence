import Link from "next/link";
import { NavLinks } from "@/components/nav-links";
import { RosterSidebar } from "@/components/roster-sidebar";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const { data: artists } = await supabase
    .from("artists")
    .select("id, name")
    .order("name");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-6">
            <Link href="/radar" className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-foreground" />
              <span className="font-mono text-xs uppercase tracking-[0.3em]">
                Cadence
              </span>
            </Link>
            <NavLinks />
          </div>

          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-6 py-8">
        <RosterSidebar artists={artists ?? []} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
