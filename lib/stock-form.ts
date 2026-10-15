import type { Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import type { StockItem } from "@/lib/stores-types";

/**
 * The stock line form shared by the add and edit dialogs. Adding needs at
 * least one item; an edit may count a line down to zero. Size is required only
 * for sized items, and which items those are comes from the API's reference
 * data, so the schema is built per call.
 */
export function stockSchema(noSizeItems: Set<string>, minQuantity: 0 | 1) {
  return z
    .object({
      itemType: z.string().min(1, "Choose an item"),
      size: z.string(),
      quantity: z
        .number({ error: "Enter a number" })
        .int("Whole items only")
        .min(minQuantity, minQuantity === 1 ? "At least 1" : "Can't be negative"),
      box: z.string().min(1, "Choose a box"),
      section: z.string().min(1, "Choose a section"),
    })
    .refine((v) => noSizeItems.has(v.itemType) || v.size.trim() !== "", {
      path: ["size"],
      message: "Enter a size",
    });
}

export type StockForm = z.infer<ReturnType<typeof stockSchema>>;

export type StockFormContext = { noSizeItems: Set<string> };

/**
 * A resolver that takes the catalogue from react-hook-form's `context`, which
 * is re-read on every validation: the catalogue arrives after the first
 * render, and useForm keeps the first resolver it's given.
 */
export function stockResolver(minQuantity: 0 | 1): Resolver<StockForm, StockFormContext> {
  return (values, context, options) =>
    zodResolver(stockSchema(context?.noSizeItems ?? new Set(), minQuantity))(values, context, options);
}

/** The body the stock API takes: unsized items are stored as "N/A", sizes trimmed. */
export function stockPayload(v: StockForm, noSizeItems: Set<string>) {
  return {
    itemType: v.itemType,
    size: noSizeItems.has(v.itemType) ? "N/A" : v.size.trim(),
    box: v.box,
    section: v.section,
    quantity: v.quantity,
  };
}

/** Where existing stock of this item is kept: the same size first, else wherever most of the type lives. */
export function suggestLocation(
  stock: StockItem[],
  itemType: string,
  size: string
): { box: string; section: string; source: "exact" | "co-location" } | null {
  const exact = stock.find((i) => i.itemType === itemType && i.size === size);
  if (exact) return { box: exact.box, section: exact.section, source: "exact" };

  const totals = new Map<string, { box: string; section: string; count: number }>();
  for (const i of stock) {
    if (i.itemType !== itemType) continue;
    const key = `${i.box}|||${i.section}`;
    const entry = totals.get(key) ?? { box: i.box, section: i.section, count: 0 };
    entry.count += i.quantity;
    totals.set(key, entry);
  }
  // Ties go to the location seen first, as before.
  let best: { box: string; section: string; count: number } | null = null;
  for (const t of totals.values()) if (!best || t.count > best.count) best = t;
  return best ? { box: best.box, section: best.section, source: "co-location" } : null;
}
