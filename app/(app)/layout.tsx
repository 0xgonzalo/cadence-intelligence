import Link from "next/link";
import { NavLinks } from "@/components/nav-links";
import { ModeToggle } from "@/components/mode-toggle";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-6">
            <Link href="/radar" className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-foreground" />
              <span className="font-mono text-xs uppercase tracking-[0.3em]">
                Cadence
              </span>
            </Link>
            <NavLinks />
          </div>

          <div className="flex items-center gap-3">
            <ModeToggle />
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
