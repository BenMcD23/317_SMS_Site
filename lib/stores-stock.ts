"use client";

import { useCallback } from "react";

import type { ShelfStructure, StockItem } from "@/lib/stores-types";
import { useApiQuery, useSetApiQueryData } from "@/lib/use-api-query";

export const STOCK_KEY = ["stores", "stock"] as const;
export const STRUCTURE_KEY = ["stores", "structure"] as const;
const NO_STOCK: StockItem[] = [];

/**
 * The uniform stock list on its own, for pages that match orders against it
 * (the orders page takes items off it). Same cache as useStoresStock.
 */
export function useStockList() {
  const query = useApiQuery<StockItem[]>(STOCK_KEY, "/api/stores/stock", { refetchOnMount: "always" });
  const setStockData = useSetApiQueryData<StockItem[]>(STOCK_KEY);
  return {
    query,
    stock: Array.isArray(query.data) ? query.data : NO_STOCK,
    setStock: useCallback(
      (update: (prev: StockItem[]) => StockItem[]) => setStockData((prev) => update(prev ?? [])),
      [setStockData]
    ),
  };
}

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
  const { query: stockQuery, stock, setStock } = useStockList();
  const structureQuery = useApiQuery<ShelfStructure>(STRUCTURE_KEY, "/api/stores/structure", {
    refetchOnMount: "always",
  });
  const setStructureData = useSetApiQueryData<ShelfStructure>(STRUCTURE_KEY);

  const loadError = stockQuery.error?.message ?? structureQuery.error?.message ?? null;
  const { refetch: refetchStock } = stockQuery;
  const { refetch: refetchStructure } = structureQuery;

  return {
    stock,
    shelfStructure: structureQuery.data ?? null,
    loading: !loadError && (stockQuery.isPending || structureQuery.isPending),
    loadError,
    setStock,
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
