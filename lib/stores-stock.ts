"use client";

import { useCallback } from "react";

import type { ShelfStructure, StockItem } from "@/lib/stores-types";
import { useApiQuery, useSetApiQueryData } from "@/lib/use-api-query";

export const STOCK_KEY = ["stores", "stock"] as const;
export const STRUCTURE_KEY = ["stores", "structure"] as const;
const NO_STOCK: StockItem[] = [];

/**
 * Uniform stock and the shelf layout it sits on. Shared by the stock overview
 * and a box's page, so opening a box from the overview shows it at once.
 *
 * Orders take items off the shelf too, so these refetch every time a page
 * mounts (still showing the cached copy meanwhile) rather than trusting a
 * minute-old list. Edits that already know the result go straight into the
 * cache through `setStock` / `setShelfStructure`.
 */
export function useStoresStock() {
  const stockQuery = useApiQuery<StockItem[]>(STOCK_KEY, "/api/stores/stock", { refetchOnMount: "always" });
  const structureQuery = useApiQuery<ShelfStructure>(STRUCTURE_KEY, "/api/stores/structure", {
    refetchOnMount: "always",
  });
  const setStockData = useSetApiQueryData<StockItem[]>(STOCK_KEY);
  const setStructureData = useSetApiQueryData<ShelfStructure>(STRUCTURE_KEY);

  const loadError = stockQuery.error?.message ?? structureQuery.error?.message ?? null;
  const { refetch: refetchStock } = stockQuery;
  const { refetch: refetchStructure } = structureQuery;

  return {
    stock: Array.isArray(stockQuery.data) ? stockQuery.data : NO_STOCK,
    shelfStructure: structureQuery.data ?? null,
    loading: !loadError && (stockQuery.isPending || structureQuery.isPending),
    loadError,
    setStock: useCallback(
      (update: (prev: StockItem[]) => StockItem[]) => setStockData((prev) => update(prev ?? [])),
      [setStockData]
    ),
    setShelfStructure: useCallback(
      (structure: ShelfStructure | null) => setStructureData(() => structure ?? undefined),
      [setStructureData]
    ),
    reload: useCallback(
      () => Promise.all([refetchStock(), refetchStructure()]),
      [refetchStock, refetchStructure]
    ),
  };
}
