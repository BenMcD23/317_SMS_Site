import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { apiRequest } from "@/lib/api-fetch";
import { API_BASE } from "@/lib/config";

/**
 * The Catalogue page's types, form rules and API calls: the uniform items and
 * badge categories stores staff can add to and retire. The API owns what an
 * edit may do (names are fixed once created, badges that have been ordered
 * can't be removed); this file only shapes the forms and reports its refusals.
 */

export type Gender = "male" | "female" | "unisex";

export type CatalogueItem = {
  id: number;
  name: string;
  gender: Gender;
  issuanceCategory: string | null;
  noSize: boolean;
  kitFlight: boolean;
  onOrderList: boolean;
  lowStockLevel: number | null;
  sizes: string[];
  sizingFields: string[];
  active: boolean;
  /** How many stock lines and order items name this item: what blocks deleting it. */
  stockRows: number;
  orderItems: number;
};

export type CatalogueBadge = {
  id: number;
  slug: string;
  name: string;
  kind: "items" | "levels";
  prefix: string | null;
  levels: string[];
  items: string[];
  gainedWhere: boolean;
  active: boolean;
  /** Badge orders and grid entries that use this category's badge names. */
  inUse: number;
};

export const ITEMS_KEY = ["catalogue", "uniform"] as const;
export const BADGES_KEY = ["catalogue", "badges"] as const;

/** The measurements the "I need sizing" form can ask for. */
export const SIZING_FIELD_OPTIONS = ["chest", "collar", "waist", "leg", "seat", "hips"] as const;

export const GENDER_LABELS: Record<Gender, string> = {
  unisex: "Anyone",
  male: "Male",
  female: "Female",
};

const MAX_ENTRIES = 300;
const MAX_TEXT = 60;

/** A textarea's lines (or comma-separated values) as a list: trimmed, blanks and repeats dropped. */
export function parseList(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\n,]/)) {
    const v = raw.trim().replace(/\s+/g, " ");
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

const listField = (empty: string) =>
  z.string().superRefine((text, ctx) => {
    const list = parseList(text);
    if (list.length > MAX_ENTRIES) ctx.addIssue({ code: "custom", message: `At most ${MAX_ENTRIES}` });
    else if (list.some((v) => v.length > MAX_TEXT))
      ctx.addIssue({ code: "custom", message: `Each entry must be ${MAX_TEXT} characters or fewer` });
    else if (empty && list.length === 0) ctx.addIssue({ code: "custom", message: empty });
  });

const nameField = z.string().trim().min(1, "Enter a name").max(MAX_TEXT, `${MAX_TEXT} characters or fewer`);

/** The "its own line" choice in the record-line picker, which Radix Select can't hold as "". */
export const OWN_LINE = "__own__";

export const itemSchema = z
  .object({
    name: nameField,
    gender: z.enum(["unisex", "male", "female"]),
    noSize: z.boolean(),
    sizes: listField(""),
    sizingFields: z.array(z.string()),
    issuanceCategory: z.string(),
    kitFlight: z.boolean(),
    onOrderList: z.boolean(),
    lowStockLevel: z.string().regex(/^\d{0,5}$/, "A whole number, 0 or more"),
  })
  .refine((v) => v.noSize || parseList(v.sizes).length > 0, {
    path: ["sizes"],
    message: "Add at least one size, or tick “Has no size”",
  });

export type ItemForm = z.infer<typeof itemSchema>;
export const itemResolver = zodResolver(itemSchema);

export const EMPTY_ITEM: ItemForm = {
  name: "",
  gender: "unisex",
  noSize: false,
  sizes: "",
  sizingFields: [],
  issuanceCategory: OWN_LINE,
  kitFlight: false,
  onOrderList: true,
  lowStockLevel: "",
};

export function itemToForm(i: CatalogueItem): ItemForm {
  return {
    name: i.name,
    gender: i.gender,
    noSize: i.noSize,
    sizes: i.sizes.join("\n"),
    sizingFields: i.sizingFields,
    issuanceCategory: i.issuanceCategory ?? OWN_LINE,
    kitFlight: i.kitFlight,
    onOrderList: i.onOrderList,
    lowStockLevel: i.lowStockLevel === null ? "" : String(i.lowStockLevel),
  };
}

/** The API body. The name is only sent when adding: it can't change afterwards. */
export function itemPayload(v: ItemForm, creating: boolean) {
  return {
    ...(creating ? { name: v.name.trim() } : {}),
    gender: v.gender,
    noSize: v.noSize,
    sizes: v.noSize ? [] : parseList(v.sizes),
    sizingFields: v.noSize ? [] : v.sizingFields,
    issuanceCategory: v.issuanceCategory === OWN_LINE ? "" : v.issuanceCategory,
    kitFlight: v.kitFlight,
    onOrderList: v.onOrderList,
    // null clears the level; the API leaves it alone only when the key is missing.
    lowStockLevel: v.lowStockLevel.trim() === "" ? null : Number(v.lowStockLevel),
  };
}

export const badgeSchema = z.object({
  name: nameField,
  kind: z.enum(["levels", "items"]),
  // Optional: a levels category with no prefix uses its name ("Music" → "Music – Gold").
  prefix: z.string().trim().max(MAX_TEXT, `${MAX_TEXT} characters or fewer`),
  entries: listField("Add at least one"),
  gainedWhere: z.boolean(),
});

export type BadgeForm = z.infer<typeof badgeSchema>;
export const badgeResolver = zodResolver(badgeSchema);

export const EMPTY_BADGE: BadgeForm = {
  name: "",
  kind: "levels",
  prefix: "",
  entries: "",
  gainedWhere: true,
};

export function badgeToForm(b: CatalogueBadge): BadgeForm {
  return {
    name: b.name,
    kind: b.kind,
    prefix: b.prefix ?? "",
    entries: (b.kind === "items" ? b.items : b.levels).join("\n"),
    gainedWhere: b.gainedWhere,
  };
}

export function badgePayload(v: BadgeForm, creating: boolean) {
  const list = parseList(v.entries);
  return {
    name: v.name.trim(),
    gainedWhere: v.gainedWhere,
    ...(v.kind === "items" ? { items: list } : { levels: list }),
    ...(creating && v.kind === "levels" && v.prefix.trim() ? { prefix: v.prefix.trim() } : {}),
  };
}

/** What a badge in a levels category is called on an order: "Music – Gold". */
export function badgeNames(
  b: Pick<CatalogueBadge, "kind" | "prefix" | "levels" | "items" | "name">
): string[] {
  return b.kind === "items" ? b.items : b.levels.map((l) => `${b.prefix || b.name} – ${l}`);
}

/** The line under an item's name: what a QM scanning the list needs to know. */
export function itemSummary(i: CatalogueItem): string {
  const parts = [i.noSize ? "No size" : `${i.sizes.length} ${i.sizes.length === 1 ? "size" : "sizes"}`];
  if (i.lowStockLevel !== null) parts.push(`orders below ${i.lowStockLevel}`);
  if (!i.onOrderList) parts.push("not on the order list");
  if (i.kitFlight) parts.push("in new cadets' kit");
  return parts.join(" · ");
}

export function badgeSummary(b: CatalogueBadge): string {
  const n = b.kind === "items" ? b.items.length : b.levels.length;
  const noun = b.kind === "items" ? (n === 1 ? "badge" : "badges") : n === 1 ? "level" : "levels";
  return `${n} ${noun}${b.inUse ? ` · ${b.inUse} in use` : ""}`;
}

// ── API calls (each rejects with the API's own message) ───────────────────────

function call<T>(token: string, method: string, path: string, body?: unknown) {
  return apiRequest<T>(
    token,
    `${API_BASE}/catalogue${path}`,
    { method, body },
    "Couldn't save the catalogue."
  );
}

export const saveItem = (token: string, id: number | null, body: ReturnType<typeof itemPayload>) =>
  id === null
    ? call<CatalogueItem>(token, "POST", "/uniform", body)
    : call<CatalogueItem>(token, "PATCH", `/uniform/${id}`, body);
export const setItemActive = (token: string, id: number, active: boolean) =>
  call<CatalogueItem>(token, "PATCH", `/uniform/${id}`, { active });
export const deleteItem = (token: string, id: number) => call<null>(token, "DELETE", `/uniform/${id}`);
export const reorderItems = (token: string, ids: number[]) =>
  call<number[]>(token, "PUT", "/uniform-order", { ids });

export const saveBadge = (token: string, id: number | null, body: ReturnType<typeof badgePayload>) =>
  id === null
    ? call<CatalogueBadge>(token, "POST", "/badges", body)
    : call<CatalogueBadge>(token, "PATCH", `/badges/${id}`, body);
export const setBadgeActive = (token: string, id: number, active: boolean) =>
  call<CatalogueBadge>(token, "PATCH", `/badges/${id}`, { active });
export const deleteBadge = (token: string, id: number) => call<null>(token, "DELETE", `/badges/${id}`);
export const reorderBadges = (token: string, ids: number[]) =>
  call<number[]>(token, "PUT", "/badges-order", { ids });

/** `ids` with the entry at `index` moved one place up (-1) or down (+1); unchanged at either end. */
export function moved(ids: number[], index: number, by: -1 | 1): number[] {
  const to = index + by;
  if (to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
