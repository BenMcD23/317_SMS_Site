"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

import { RouteTabs } from "@/components/route-tabs";
import { areaFor, visibleSections, type NavLink } from "@/lib/navigation";

/**
 * The area (lib/navigation.ts) the current page is part of, with only the tabs
 * this user can reach, or null for a page that stands alone. Shared by the
 * tab row and by layouts that title themselves after their area.
 */
export function useArea(): NavLink | null {
  // Null outside the app router (a component rendered on its own in a test).
  const pathname = usePathname() ?? "";
  const { data: session } = useSession() ?? {};
  return areaFor(pathname, visibleSections(session?.role, session?.user?.email ?? undefined, session?.is_oc));
}

/**
 * The tab row of the current page's area, so related pages (Uniform and Badge
 * orders, Texts and Recipients) are one tap apart without each having a
 * sidebar row. Nothing when the page stands alone, or when the user can reach
 * only one page of the area: a single tab is just noise.
 */
export function AreaTabs() {
  const area = useArea();
  if (!area?.tabs || area.tabs.length < 2) return null;
  return <RouteTabs tabs={area.tabs} label={area.label} />;
}
