"use client";

import { createContext, createElement, useContext, useMemo } from "react";

import { useApiQuery } from "@/lib/use-api-query";

/**
 * Reference data served by the API's GET /reference — the uniform catalogue
 * (item types, sizes, which items need sizing) and the badge catalogue. It
 * used to be hardcoded here and in the cadet portal and the two copies had
 * drifted; now the API is the only source and this file just types it.
 *
 * `useReference()` returns empty lists until the first fetch resolves, so a
 * form renders immediately and fills its pickers a moment later.
 */

export type BadgeCategory = {
  id: string;
  name: string;
  /** Fixed item names — no level selection */
  items?: string[];
  /** Sub-types that each take a level; the badge name is "<subType> – <level>" */
  subTypes?: string[];
  /** Levels directly on the category; the badge name is "<prefix> – <level>" */
  levels?: string[];
  prefix?: string;
};

export type GainedWhereOption = { value: string; label: string };

export type ReferencePayload = {
  uniform: {
    itemTypes: string[];
    noSizeItems: string[];
    sizes: Record<string, string[]>;
    sizingFields: Record<string, string[]>;
    gender: Record<string, "male" | "female" | "unisex">;
    issuanceCategories: string[];
    issuanceCategoryByItem: Record<string, string>;
    kitFlightItems: string[];
  };
  badges: {
    categories: BadgeCategory[];
    categoriesWithoutGainedWhere: string[];
    gainedWhereOptions: GainedWhereOption[];
  };
};

export type Reference = {
  loaded: boolean;
  itemTypes: string[];
  noSizeItems: Set<string>;
  sizes: Record<string, string[]>;
  sizingFields: Record<string, string[]>;
  issuanceCategories: string[];
  badgeCategories: BadgeCategory[];
  categoriesWithoutGainedWhere: Set<string>;
  gainedWhereOptions: GainedWhereOption[];
};

const EMPTY: Reference = {
  loaded: false,
  itemTypes: [],
  noSizeItems: new Set(),
  sizes: {},
  sizingFields: {},
  issuanceCategories: [],
  badgeCategories: [],
  categoriesWithoutGainedWhere: new Set(),
  gainedWhereOptions: [],
};

function normalise(data: ReferencePayload): Reference {
  return {
    loaded: true,
    itemTypes: data.uniform.itemTypes,
    noSizeItems: new Set(data.uniform.noSizeItems),
    sizes: data.uniform.sizes,
    sizingFields: data.uniform.sizingFields,
    issuanceCategories: data.uniform.issuanceCategories,
    badgeCategories: data.badges.categories,
    categoriesWithoutGainedWhere: new Set(data.badges.categoriesWithoutGainedWhere),
    gainedWhereOptions: data.badges.gainedWhereOptions,
  };
}

const ReferenceContext = createContext<Reference>(EMPTY);

/** Fetches the catalogue once per session and shares it with every page. */
export function ReferenceProvider({ children }: { children: React.ReactNode }) {
  const { data } = useApiQuery<ReferencePayload>(["reference"], "/reference", {
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const value = useMemo(() => (data ? normalise(data) : EMPTY), [data]);
  return createElement(ReferenceContext.Provider, { value }, children);
}

export function useReference(): Reference {
  return useContext(ReferenceContext);
}

// ── Pure helpers (take the data they need, so they work outside components) ──

/** Build the badge name string from a category and the chosen sub-type/level. */
export function buildBadgeName(
  category: BadgeCategory,
  subType: string | null,
  level: string | null
): string | null {
  if (category.items) return subType ?? null;
  if (category.subTypes) return subType && level ? `${subType} – ${level}` : null;
  if (category.levels) return level ? `${category.prefix} – ${level}` : null;
  return null;
}

/** Parse a badge name back into its category and level. */
export function parseBadgeName(
  categories: BadgeCategory[],
  name: string
): { category: BadgeCategory | null; subType: string | null; level: string | null } {
  for (const cat of categories) {
    if (cat.items?.includes(name)) return { category: cat, subType: name, level: null };
  }
  const sep = name.indexOf(" – ");
  if (sep !== -1) {
    const prefix = name.slice(0, sep);
    const level = name.slice(sep + 3);
    for (const cat of categories) {
      if (cat.subTypes?.includes(prefix) && cat.levels?.includes(level))
        return { category: cat, subType: prefix, level };
      if (cat.prefix === prefix && cat.levels?.includes(level))
        return { category: cat, subType: null, level };
    }
  }
  return { category: null, subType: null, level: null };
}

export function gainedWhereLabel(
  options: GainedWhereOption[],
  value: string | null | undefined
): string | null {
  return options.find((o) => o.value === value)?.label ?? null;
}

/** Replacements and the automatically-awarded categories don't record where a badge was gained. */
export function needsGainedWhere(
  categoriesWithoutGainedWhere: Set<string>,
  categoryId: string | null | undefined,
  replacement: boolean
): boolean {
  if (replacement) return false;
  return !categoryId || !categoriesWithoutGainedWhere.has(categoryId);
}
