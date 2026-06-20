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
  const onCatalog = pathname === "/catalog";
  const basePath = onCatalog ? "/catalog" : "/radar";

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
            className="flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-brand/50 hover:text-brand-bright"
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
              className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-brand-bright"
            >
              <Chevron direction="left" />
            </button>
          </div>
        </div>

        <Link
          href="/onboard"
          className={cn(
            "flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors",
            pathname === "/onboard"
              ? "border-brand/50 text-brand-bright"
              : "border-border text-muted-foreground hover:border-brand/50 hover:text-brand-bright",
          )}
        >
          <span className="text-base leading-none">+</span>
          Add an artist
        </Link>

        {artists.length > 0 ? (
          <nav className="flex flex-col gap-1">
            {artists.map((a) => {
              const active = (onRadar || onCatalog) && activeArtist === a.id;
              return (
                <Link
                  key={a.id}
                  href={`${basePath}?artist=${a.id}`}
                  className={cn(
                    "group/item flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-brand/12 text-brand-bright"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 shrink-0 rounded-full transition-colors",
                      active
                        ? "bg-brand [box-shadow:0_0_8px_1px_var(--brand)]"
                        : "bg-muted-foreground/40 group-hover/item:bg-foreground/60",
                    )}
                  />
                  <span className="truncate">{a.name}</span>
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
