"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

import { areaFor, visibleSections, type NavLink } from "@/lib/navigation";

/**
 * The area (lib/navigation.ts) the current page is part of, with only the
 * pages this user can reach, or null for a page that stands alone. For layouts
 * shared by several areas that title themselves after the one they're in (the
 * marking sheets: Assessments, or Inspections).
 */
export function useArea(): NavLink | null {
  // Null outside the app router (a component rendered on its own in a test).
  const pathname = usePathname() ?? "";
  const { data: session } = useSession() ?? {};
  return areaFor(pathname, visibleSections(session?.role, session?.user?.email ?? undefined, session?.is_oc));
}
