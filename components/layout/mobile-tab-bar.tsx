"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Menu } from "lucide-react";

import { useSidebar } from "@/components/ui/sidebar";
import {
  activeMobileSection,
  activeMobileShortcut,
  isGroup,
  isLinkActive,
  mobileSectionsFor,
  mobileShortcutsFor,
  type MobileSection,
  type NavLink,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

const TAB =
  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors";

/**
 * Bottom bar on a phone, where the thumb is. It starts with the role's
 * parade-night shortcuts (lib/navigation.ts `mobileShortcutsFor`), plain links
 * a single tap away, then one tab per sidebar section (`mobileSectionsFor`),
 * all in one strip that scrolls sideways when it doesn't fit. Tapping a
 * section opens its pages in a sheet just above the bar. The bar stays live while the sheet is open, so a wrong section is fixed
 * with one more tap rather than close-and-retry. "Menu" stays pinned at the
 * end for the account menu and anything else the full sidebar holds. Hidden
 * from md up, where the sidebar is always on screen.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { setOpenMobile, openMobile } = useSidebar();
  const shortcuts = mobileShortcutsFor(session?.role);
  // The unnamed first section (dashboard, stats, OC) is mostly the Home
  // shortcut already; the rest of it is in Menu, and Stats is on the dashboard.
  const tabs = mobileSectionsFor(session?.role, session?.user?.email ?? undefined, session?.is_oc).filter(
    (t) => t.section.label
  );
  // A shortcut beats its section: on Orders, "Orders" lights, not "Stores".
  const activeShortcut = activeMobileShortcut(pathname, shortcuts);
  const active = activeShortcut ? null : activeMobileSection(pathname, tabs);
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  const open = tabs.find((t) => t.label === openLabel) ?? null;

  // Navigating (by the sheet, the back button or anything else) closes it.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpenLabel(null);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenLabel(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <AnimatePresence>
        {open && (
          <SectionSheet key="sheet" tab={open} pathname={pathname} onClose={() => setOpenLabel(null)} />
        )}
      </AnimatePresence>
      <nav
        aria-label="Quick links"
        className="no-print bg-background/95 supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-0 z-40 flex border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <SectionScroller activeKey={activeShortcut ? `link:${activeShortcut.href}` : active?.label}>
          {shortcuts.map((tab) => {
            const current = tab === activeShortcut;
            return (
              <li key={tab.href} className="flex-none snap-start" data-tab={`link:${tab.href}`}>
                <Link
                  href={tab.href}
                  onClick={() => setOpenLabel(null)}
                  aria-current={current ? "page" : undefined}
                  className={cn(TAB, "w-[4.5rem]", current ? "text-primary" : "text-muted-foreground")}
                >
                  <tab.icon className="size-5" aria-hidden />
                  {tab.label}
                </Link>
              </li>
            );
          })}
          {shortcuts.length > 0 && tabs.length > 0 && (
            // Splits one-tap links from tabs that open a sheet.
            <li aria-hidden className="bg-border my-3 w-px flex-none" />
          )}
          {tabs.map((tab) => {
            const current = tab === active;
            const expanded = tab === open;
            return (
              <li key={tab.label} className="flex-none snap-start" data-tab={tab.label}>
                <button
                  type="button"
                  onClick={() => setOpenLabel(expanded ? null : tab.label)}
                  aria-expanded={expanded}
                  aria-haspopup="dialog"
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    TAB,
                    "w-[4.5rem]",
                    current || expanded ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <tab.icon className="size-5" aria-hidden />
                  {tab.label}
                </button>
              </li>
            );
          })}
        </SectionScroller>
        <div className="border-l">
          <button
            type="button"
            onClick={() => {
              setOpenLabel(null);
              setOpenMobile(true);
            }}
            aria-expanded={openMobile}
            className={cn(TAB, "text-muted-foreground w-16")}
          >
            <Menu className="size-5" aria-hidden />
            Menu
          </button>
        </div>
      </nav>
    </>
  );
}

/**
 * The sideways-scrolling strip of shortcuts and section tabs. Fades whichever edge has more
 * tabs past it, so a cut-off row reads as "scroll me" rather than "that's all",
 * and starts scrolled to the current page's section so it's never off screen.
 */
function SectionScroller({ activeKey, children }: { activeKey?: string; children: React.ReactNode }) {
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
    const tab = activeKey ? el?.querySelector(`[data-tab="${CSS.escape(activeKey)}"]`) : null;
    // jsdom has no scrollIntoView; there's nothing to scroll there anyway.
    tab?.scrollIntoView?.({ inline: "center", block: "nearest" });
    measure();
  }, [activeKey, measure]);

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

/** A section's pages, in a sheet that rises out of the bar. Groups keep their heading. */
function SectionSheet({
  tab,
  pathname,
  onClose,
}: {
  tab: MobileSection;
  pathname: string;
  onClose: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), [tab]);

  return (
    <>
      <motion.div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-30 bg-black/40 md:hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      />
      <motion.div
        role="dialog"
        aria-labelledby="mobile-section-title"
        className="bg-background fixed inset-x-0 bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-30 max-h-[60vh] overflow-y-auto rounded-t-lg border-t px-2 pt-3 pb-2 md:hidden"
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <h2
          id="mobile-section-title"
          ref={headingRef}
          tabIndex={-1}
          className="px-3 pb-1 text-sm font-semibold outline-none"
        >
          {tab.label}
        </h2>
        <ul>
          {tab.section.items.map((item) =>
            isGroup(item) ? (
              <li key={item.label}>
                <p className="text-muted-foreground px-3 pt-3 pb-1 text-xs font-medium">{item.label}</p>
                <ul>
                  {item.links.map((link) => (
                    <SheetLink key={link.href} link={link} pathname={pathname} onNavigate={onClose} />
                  ))}
                </ul>
              </li>
            ) : (
              <SheetLink key={item.href} link={item} pathname={pathname} onNavigate={onClose} />
            )
          )}
        </ul>
      </motion.div>
    </>
  );
}

function SheetLink({
  link,
  pathname,
  onNavigate,
}: {
  link: NavLink;
  pathname: string;
  // Tapping the page you're already on changes no path, so close explicitly.
  onNavigate: () => void;
}) {
  const current = isLinkActive(pathname, link.href, link.exact);
  return (
    <li>
      <Link
        href={link.href}
        onClick={onNavigate}
        aria-current={current ? "page" : undefined}
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm",
          current ? "bg-primary/10 text-primary font-medium" : "active:bg-muted"
        )}
      >
        <link.icon className="size-4 shrink-0" aria-hidden />
        <span className="flex-1">{link.label}</span>
        <ChevronRight className="text-muted-foreground size-4" aria-hidden />
      </Link>
    </li>
  );
}
