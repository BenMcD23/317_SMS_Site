import { z } from "zod";

import type { CommitteeRequestDetail } from "@/lib/committee";

/**
 * The committee request form, shared by the new-request page and the OC's
 * edit dialog so both validate and send the same shape. Each item's total
 * fills itself from quantity × unit cost but stays editable (a multi-buy, a
 * delivery charge folded in), so it is part of the form, not derived.
 */
const money = z.number({ error: "Enter an amount" }).min(0, "Can't be negative");

export const committeeRequestSchema = z.object({
  title: z.string().trim().min(1, "Give the request a title"),
  justification: z.string(),
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1, "Say what the item is"),
        quantity: z.number({ error: "Enter a quantity" }).int("Whole numbers only").min(1, "At least 1"),
        unitCost: money,
        total: money,
      })
    )
    .min(1, "Add at least one item"),
});

export type CommitteeRequestForm = z.infer<typeof committeeRequestSchema>;
export type CommitteeItemForm = CommitteeRequestForm["items"][number];

/** Pounds to the penny, so 3 × £0.10 shows £0.30, not £0.30000000000000004. */
export function lineTotal(quantity: number, unitCost: number): number {
  if (!Number.isFinite(quantity) || !Number.isFinite(unitCost)) return NaN;
  return Math.round(quantity * unitCost * 100) / 100;
}

/** The sum of the lines, ignoring any that aren't filled in yet. */
export function requestTotal(items: Pick<CommitteeItemForm, "total">[]): number {
  return items.reduce((sum, i) => sum + (Number.isFinite(i.total) ? i.total : 0), 0);
}

// NaN leaves the number inputs empty for a fresh row, rather than showing 0.
export const emptyItem = (): CommitteeItemForm => ({
  description: "",
  quantity: 1,
  unitCost: NaN,
  total: NaN,
});

export const emptyRequest = (): CommitteeRequestForm => ({
  title: "",
  justification: "",
  items: [emptyItem()],
});

export function requestToForm(req: CommitteeRequestDetail): CommitteeRequestForm {
  return {
    title: req.title,
    justification: req.justification,
    items: req.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitCost: i.unit_cost,
      total: i.cost,
    })),
  };
}

/** The body the API takes; `cost` is the line total. */
export function formToPayload(v: CommitteeRequestForm) {
  return {
    title: v.title.trim(),
    justification: v.justification,
    items: v.items.map((i) => ({
      description: i.description.trim(),
      quantity: i.quantity,
      unit_cost: i.unitCost,
      cost: i.total,
    })),
  };
}
