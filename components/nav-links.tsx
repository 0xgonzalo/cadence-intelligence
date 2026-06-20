"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/radar", label: "Radar", artistScoped: true },
  { href: "/catalog", label: "Catalog", artistScoped: true },
  { href: "/agent", label: "Agent", artistScoped: false },
];

export function NavLinks() {
  const pathname = usePathname();
  const artist = useSearchParams().get("artist");
  return (
    <nav className="flex items-center gap-1">
      {LINKS.map((link) => {
        const active =
          pathname === link.href || pathname.startsWith(`${link.href}/`);
        const href =
          link.artistScoped && artist
            ? `${link.href}?artist=${artist}`
            : link.href;
        return (
          <Link
            key={link.href}
            href={href}
            className={cn(
              "relative rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] transition-colors",
              active
                ? "bg-brand/12 text-brand-bright"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
            )}
          >
            {link.label}
            {active ? (
              <span
                aria-hidden
                className="absolute inset-x-3 -bottom-px h-px bg-brand [box-shadow:0_0_8px_1px_var(--brand)]"
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
