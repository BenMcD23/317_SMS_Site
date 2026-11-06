"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type RouteTab = {
  label: string;
  href: string;
  /** Only light up on this exact path: for an area's index page, whose siblings live under it. */
  exact?: boolean;
};

export function isTabActive(pathname: string, tab: RouteTab): boolean {
  return pathname === tab.href || (!tab.exact && pathname.startsWith(tab.href + "/"));
}

/**
 * The tab row for an area whose parts are separate pages (Assessment Sheets,
 * Training): real links, so each part has its own URL, the back button works
 * and a part can be bookmarked or linked to. Use the shadcn `Tabs` instead
 * when the parts are views of one page. Scrolls sideways on a phone.
 */
export function RouteTabs({ tabs, label }: { tabs: RouteTab[]; label: string }) {
  const pathname = usePathname();
  const nav = useRef<HTMLElement>(null);

  // On a phone the row is wider than the screen: bring the current tab into
  // view, or a page reached by a link opens with its own tab hidden.
  useEffect(() => {
    const current = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  return (
    <nav ref={nav} aria-label={label} className="overflow-x-auto">
      <div className="flex min-w-max gap-1 border-b">
        {tabs.map((tab) => {
          const active = isTabActive(pathname, tab);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground border-transparent"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
