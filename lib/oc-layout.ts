import { arrayMove } from "@dnd-kit/sortable";

/**
 * The OC dashboard's sections and the order the OC has dragged them into.
 * The ids match OC_SECTIONS in the API's routers/oc.py, which saves the order
 * per user; change the two together.
 */
export const OC_SECTIONS = ["committee", "strength", "qualifications", "pipeline"] as const;
export type OcSection = (typeof OC_SECTIONS)[number];

export const OC_SECTION_TITLES: Record<OcSection, string> = {
  committee: "Committee Requests",
  strength: "Strength & Attendance",
  qualifications: "Qualifications",
  pipeline: "In the Pipeline",
};

/** What GET/PUT/DELETE /oc/dashboard/layout answer with. */
export interface OcLayout {
  sections: string[];
  customised: boolean;
}

/**
 * A saved order made safe to render: ids this site doesn't know (an API a
 * deploy ahead) dropped, duplicates removed, and any section missing from it
 * added at the bottom, so every section shows exactly once whatever came back.
 */
export function normaliseLayout(saved: unknown): OcSection[] {
  const known = new Set<string>(OC_SECTIONS);
  const list = Array.isArray(saved) ? saved : [];
  const kept = [...new Set(list.filter((s): s is OcSection => typeof s === "string" && known.has(s)))];
  return [...kept, ...OC_SECTIONS.filter((s) => !kept.includes(s))];
}

/** The order with `id` moved one place up (-1) or down (+1); unchanged at either end. */
export function moveSection(order: OcSection[], id: OcSection, by: -1 | 1): OcSection[] {
  const from = order.indexOf(id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= order.length) return order;
  return arrayMove(order, from, to);
}
