"use client";

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
 * Bottom tab bar on a phone, where the thumb is. Holds the few pages each role
 * uses on parade night (lib/navigation.ts `mobileTabsFor`); "More" opens the
 * full sidebar for everything else. Hidden from md up, where the sidebar is
 * always on screen.
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
      className="no-print bg-background/95 supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
        {tabs.map((tab) => {
          const current = tab === active;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={cn(TAB, current ? "text-primary" : "text-muted-foreground")}
              >
                <tab.icon className="size-5" aria-hidden />
                {tab.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => setOpenMobile(true)}
            aria-expanded={openMobile}
            className={cn(TAB, "text-muted-foreground w-full")}
          >
            <Menu className="size-5" aria-hidden />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}
