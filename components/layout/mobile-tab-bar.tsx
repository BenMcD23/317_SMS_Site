"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Menu } from "lucide-react";

import { useSidebar } from "@/components/ui/sidebar";
import { activeMobileTab, mobileTabsFor } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const TAB =
  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors";

/**
 * Bottom tab bar on a phone, where the thumb is. Every tab is a plain link to a
 * page (lib/navigation.ts `mobileTabsFor`, ordered by use), in a strip that
 * scrolls sideways when they don't fit; "More" stays pinned at the end and
 * opens the full sidebar. Hidden from md up, where the sidebar is always on
 * screen.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { setOpenMobile, openMobile } = useSidebar();
  const tabs = mobileTabsFor(session?.role);
  const active = activeMobileTab(pathname, tabs);

  return (
    <nav
      aria-label="Quick links"
      className="no-print bg-background/95 supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-0 z-30 flex border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <TabScroller activeHref={active?.href}>
        {tabs.map((tab) => {
          const current = tab === active;
          return (
            <li key={tab.href} className="flex-none snap-start" data-tab={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={cn(TAB, "w-[4.5rem]", current ? "text-primary" : "text-muted-foreground")}
              >
                <tab.icon className="size-5" aria-hidden />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </TabScroller>
      <div className="border-l">
        <button
          type="button"
          onClick={() => setOpenMobile(true)}
          aria-expanded={openMobile}
          className={cn(TAB, "text-muted-foreground w-16")}
        >
          <Menu className="size-5" aria-hidden />
          More
        </button>
      </div>
    </nav>
  );
}

/**
 * The sideways-scrolling strip. Fades whichever edge has more tabs past it, so
 * a cut-off row reads as "scroll me" rather than "that's all", and starts
 * scrolled to the current page's tab so it's never off screen.
 */
function TabScroller({ activeHref, children }: { activeHref?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft > 4,
      end: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    const tab = activeHref ? el?.querySelector(`[data-tab="${CSS.escape(activeHref)}"]`) : null;
    // jsdom has no scrollIntoView; there's nothing to scroll there anyway.
    tab?.scrollIntoView?.({ inline: "center", block: "nearest" });
    measure();
  }, [activeHref, measure]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const fade = edges.start || edges.end;
  return (
    <ul
      ref={ref}
      onScroll={measure}
      className="flex min-w-0 flex-1 snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden"
      style={
        fade
          ? {
              maskImage: `linear-gradient(to right, ${edges.start ? "transparent" : "black"}, black 1.5rem, black calc(100% - 1.5rem), ${edges.end ? "transparent" : "black"})`,
            }
          : undefined
      }
    >
      {children}
    </ul>
  );
}
