"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type HubTab = {
  label: string;
  href: string;
  icon?: React.ElementType;
  /** Match this prefix for the active state instead of an exact href match. */
  activePrefix?: string;
};

function isActive(pathname: string, tab: HubTab): boolean {
  if (tab.activePrefix) return pathname === tab.activePrefix || pathname.startsWith(tab.activePrefix + "/");
  return pathname === tab.href;
}

/**
 * Horizontal, route-based tab strip used to consolidate a group of related
 * pages into a single hub. Mirrors the styling of the assessment-sheets tabs.
 * Renders nothing when there is one tab or fewer (no point showing a strip).
 */
export function HubTabs({ tabs, className }: { tabs: HubTab[]; className?: string }) {
  const pathname = usePathname();
  if (tabs.length <= 1) return null;

  return (
    <div className={cn("overflow-x-auto", className)}>
      <div className="flex min-w-max gap-1 border-b">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.icon && <tab.icon className="size-4" />}
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
