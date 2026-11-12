"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { LogOut, Menu, Pin, Search, Settings } from "lucide-react";

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_PINS, pinLabel, searchPages, type PageLink } from "@/lib/mobile-pins";
import { useQuickPages } from "@/lib/quick-pages";
import { cn } from "@/lib/utils";

const TAB =
  "flex min-h-14 w-full min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium transition-colors";

/**
 * Bottom bar on a phone: the four pages this person pinned (one tap each) and
 * Menu, which slides up their recent pages, a search box and every page, each
 * with a pin to add it to the bar. Hidden from md up, where the sidebar is.
 */
export function MobileTabBar() {
  const { data: session } = useSession();
  const role = session?.role;
  // Shared with the sidebar's Pinned list and ⌘K (lib/quick-pages.ts); the
  // app shell records recent pages.
  const { pages, pins, recent, here, togglePin } = useQuickPages();
  const [open, setOpen] = useState(false);
  const byHref = new Map(pages.map((p) => [p.href, p]));

  return (
    <>
      <nav
        aria-label="Quick links"
        className="no-print bg-background/95 supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-0 z-30 flex border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="flex min-w-0 flex-1">
          {pins.map((href) => {
            const page = byHref.get(href)!;
            const current = here?.href === href;
            return (
              <li key={href} className="flex min-w-0 flex-1">
                <Link
                  href={href}
                  aria-current={current ? "page" : undefined}
                  className={cn(TAB, current ? "text-primary" : "text-muted-foreground")}
                >
                  <page.icon className="size-5 shrink-0" aria-hidden />
                  <span className="w-full truncate text-center">{pinLabel(page, role, pages)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="flex w-1/5 flex-none border-l">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            className={cn(TAB, "text-muted-foreground")}
          >
            <Menu className="size-5" aria-hidden />
            Menu
          </button>
        </div>
      </nav>
      <QuickMenu
        open={open}
        onOpenChange={setOpen}
        pages={pages}
        pins={pins}
        recent={recent.filter((h) => h !== here?.href)}
        onTogglePin={togglePin}
      />
    </>
  );
}

/** One page in the menu: the link, and a pin to put it on (or take it off) the bar. */
function PageRow({
  page,
  pinned,
  pinsFull,
  onTogglePin,
  onNavigate,
}: {
  page: PageLink;
  pinned: boolean;
  pinsFull: boolean;
  onTogglePin: () => void;
  onNavigate: () => void;
}) {
  const place = page.path.join(" › ");
  return (
    <li className="flex items-center gap-1">
      <Link
        href={page.href}
        onClick={onNavigate}
        className="hover:bg-muted/50 flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-md px-2"
      >
        <page.icon className="text-muted-foreground size-5 shrink-0" aria-hidden />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{page.label}</span>
          {place && <span className="text-muted-foreground truncate text-xs">{place}</span>}
        </span>
      </Link>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("size-10 shrink-0", pinned ? "text-primary" : "text-muted-foreground")}
        aria-pressed={pinned}
        aria-label={pinned ? `Unpin ${page.label}` : `Pin ${page.label}`}
        // A full bar refuses a fifth: unpin one first. Disabled says so.
        disabled={!pinned && pinsFull}
        onClick={onTogglePin}
      >
        {/* Filled when it is on the bar; a crossed-out pin read as "not pinned". */}
        <Pin className={cn(pinned && "fill-current")} />
      </Button>
    </li>
  );
}

function QuickMenu({
  open,
  onOpenChange,
  pages,
  pins,
  recent,
  onTogglePin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: PageLink[];
  pins: string[];
  recent: string[];
  onTogglePin: (href: string) => void;
}) {
  const [query, setQuery] = useState("");
  const byHref = new Map(pages.map((p) => [p.href, p]));
  const pinsFull = pins.length >= MAX_PINS;
  const close = () => {
    onOpenChange(false);
    setQuery("");
  };
  const row = (page: PageLink) => (
    <PageRow
      key={page.href}
      page={page}
      pinned={pins.includes(page.href)}
      pinsFull={pinsFull}
      onTogglePin={() => onTogglePin(page.href)}
      onNavigate={close}
    />
  );

  const found = searchPages(pages, query);
  const recentPages = recent.map((h) => byHref.get(h)!).filter(Boolean);
  // Every page under its section's name, in the sidebar's order.
  const sections: Array<[string, PageLink[]]> = [];
  for (const page of pages) {
    const name = page.path[0] ?? "General";
    const last = sections[sections.length - 1];
    if (last && last[0] === name) last[1].push(page);
    else sections.push([name, [page]]);
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Menu</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Pin up to {MAX_PINS} pages to the bar with{" "}
            <Pin className="inline size-3.5" aria-label="the pin" />.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="flex flex-col gap-5 pb-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quick-menu-search" className="sr-only">
              Find a page
            </Label>
            <div className="relative">
              <Search
                className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                id="quick-menu-search"
                type="search"
                placeholder="Find a page…"
                className="h-11 pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {query.trim() ? (
            <section aria-label="Results">
              {found.length ? (
                <ul className="flex flex-col">{found.map(row)}</ul>
              ) : (
                <p className="text-muted-foreground px-2 text-sm">No page matches “{query.trim()}”.</p>
              )}
            </section>
          ) : (
            <>
              {recentPages.length > 0 && (
                <section aria-labelledby="quick-menu-recent" className="flex flex-col gap-1">
                  <h3 id="quick-menu-recent" className="text-muted-foreground px-2 text-xs font-medium">
                    Recent
                  </h3>
                  <ul className="flex flex-col">{recentPages.map(row)}</ul>
                </section>
              )}
              {sections.map(([name, list]) => (
                <section key={name} aria-label={name} className="flex flex-col gap-1">
                  <h3 className="text-muted-foreground px-2 text-xs font-medium">{name}</h3>
                  <ul className="flex flex-col">{list.map(row)}</ul>
                </section>
              ))}
              <section aria-label="Account" className="flex flex-col gap-1 border-t pt-3">
                <Link
                  href="/settings"
                  onClick={close}
                  className="hover:bg-muted/50 flex min-h-12 items-center gap-3 rounded-md px-2 text-sm font-medium"
                >
                  <Settings className="text-muted-foreground size-5" aria-hidden />
                  Settings
                </Link>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="text-destructive hover:bg-muted/50 flex min-h-12 items-center gap-3 rounded-md px-2 text-left text-sm font-medium"
                >
                  <LogOut className="size-5" aria-hidden />
                  Sign out
                </button>
              </section>
            </>
          )}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
