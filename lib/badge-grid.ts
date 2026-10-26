"use client";

import { useCallback } from "react";

import type { BadgeGrid } from "@/lib/stores-types";
import { useApiQuery, useSetApiQueryData } from "@/lib/use-api-query";

export const BADGE_GRID_KEY = ["stores", "badges", "grid"] as const;

/**
 * The badge stock grid. Shared by the badge stock page and the badge orders
 * page (which takes badges off it), so both see one copy. Refetched on every
 * visit, showing the cached grid meanwhile, since either page can change it.
 */
export function useBadgeGrid() {
  const query = useApiQuery<BadgeGrid>(BADGE_GRID_KEY, "/api/stores/badges", { refetchOnMount: "always" });
  const setCached = useSetApiQueryData<BadgeGrid>(BADGE_GRID_KEY);
  return {
    query,
    grid: query.data ?? null,
    /** A new grid, or an update of the current one; null leaves nothing cached. */
    setGrid: useCallback(
      (update: BadgeGrid | null | ((prev: BadgeGrid | null) => BadgeGrid | null)) =>
        setCached((prev) => (typeof update === "function" ? update(prev ?? null) : update) ?? undefined),
      [setCached]
    ),
  };
}
