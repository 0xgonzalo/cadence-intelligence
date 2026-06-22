import Image from "next/image";
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
      <header className="sticky top-0 z-20 border-b border-border bg-background/70 backdrop-blur-xl">
        {/* phosphor hairline along the header base */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-brand/50 to-transparent"
        />
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-6">
            <Link href="/radar" className="group flex items-center gap-2.5">
              <span className="relative flex size-2">
                <span className="absolute inset-0 animate-signal rounded-full bg-brand" />
                <span className="relative size-2 rounded-full bg-brand" />
              </span>
              <Image
                src="/logo.png"
                alt="Cadence"
                width={858}
                height={210}
                priority
                className="h-7 w-auto transition-opacity group-hover:opacity-80"
              />
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
