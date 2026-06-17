"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Artist ↔ Label scope toggle. Artist mode is the per-artist Radar; Label mode
 * is the cross-roster grid at /roster. Same intelligence engine, two scopes.
 */
export function ModeToggle() {
  const pathname = usePathname();
  const label = pathname === "/roster" || pathname.startsWith("/roster/");

  return (
    <div className="flex items-center rounded-lg border border-border p-0.5 font-mono text-[10px] uppercase tracking-[0.18em]">
      <Link
        href="/radar"
        className={cn(
          "rounded-md px-2.5 py-1 transition-colors",
          label
            ? "text-muted-foreground hover:text-foreground"
            : "bg-secondary text-foreground",
        )}
      >
        Artist
      </Link>
      <Link
        href="/roster"
        className={cn(
          "rounded-md px-2.5 py-1 transition-colors",
          label
            ? "bg-secondary text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Label
      </Link>
    </div>
  );
}
