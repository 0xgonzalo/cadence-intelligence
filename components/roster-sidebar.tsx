"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

interface SidebarArtist {
  id: string;
  name: string;
}

const STORAGE_KEY = "roster-sidebar-collapsed";

const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot() {
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

function setCollapsedPref(value: boolean) {
  window.localStorage.setItem(STORAGE_KEY, String(value));
  listeners.forEach((l) => l());
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn(direction === "left" ? "" : "rotate-180")}
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function RosterSidebar({ artists }: { artists: SidebarArtist[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeArtist = searchParams.get("artist");
  const onRadar = pathname === "/radar";

  const collapsed = useSyncExternalStore(subscribe, getSnapshot, () => false);

  const toggle = () => setCollapsedPref(!collapsed);

  if (collapsed) {
    return (
      <aside className="hidden w-10 shrink-0 md:block">
        <div className="sticky top-20">
          <button
            type="button"
            onClick={toggle}
            title="Expand artists"
            aria-label="Expand artists"
            className="flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
          >
            <Chevron direction="right" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden w-56 shrink-0 md:block">
      <div className="sticky top-20 space-y-4">
        <div className="flex items-center justify-between px-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            Your artists
          </p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {artists.length}
            </span>
            <button
              type="button"
              onClick={toggle}
              title="Collapse artists"
              aria-label="Collapse artists"
              className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
            >
              <Chevron direction="left" />
            </button>
          </div>
        </div>

        <Link
          href="/onboard"
          className={cn(
            "flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors",
            pathname === "/onboard"
              ? "border-foreground/40 text-foreground"
              : "text-muted-foreground hover:border-foreground/40 hover:text-foreground",
          )}
        >
          <span className="text-base leading-none">+</span>
          Add an artist
        </Link>

        {artists.length > 0 ? (
          <nav className="flex flex-col gap-1">
            {artists.map((a) => {
              const active = onRadar && activeArtist === a.id;
              return (
                <Link
                  key={a.id}
                  href={`/radar?artist=${a.id}`}
                  className={cn(
                    "truncate rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  {a.name}
                </Link>
              );
            })}
          </nav>
        ) : (
          <p className="px-1 text-xs text-muted-foreground">
            No artists yet. Add your first to start tracking momentum.
          </p>
        )}
      </div>
    </aside>
  );
}
