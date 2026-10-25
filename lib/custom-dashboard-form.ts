import { z } from "zod";

import {
  type Dataset,
  type FilterOp,
  type Grain,
  type Panel,
  type QuerySpec,
  type SortOrder,
  type Viz,
  emptyQuery,
  fieldOf,
  opTakesValue,
} from "@/lib/custom-dashboard";

/**
 * The panel editor's form: the query flattened into plain strings so every
 * control is a simple select or input, and converted back to the API's shape
 * on save. "" means "none" for the two group-bys.
 */
export interface PanelForm {
  title: string;
  viz: Viz;
  dataset: string;
  measure: string;
  group1: string;
  grain1: Grain;
  group2: string;
  grain2: Grain;
  sort: SortOrder;
  filters: { field: string; op: FilterOp; value: string }[];
}

export const panelFormSchema = z
  .object({
    title: z.string().trim().min(1, "Give the panel a title").max(80, "80 characters at most"),
    viz: z.enum(["bar", "line", "stat", "table"]),
    dataset: z.string().min(1, "Pick a dataset"),
    measure: z.string().min(1, "Pick what to count"),
    group1: z.string(),
    grain1: z.enum(["day", "week", "month", "year"]),
    group2: z.string(),
    grain2: z.enum(["day", "week", "month", "year"]),
    sort: z.enum(["label", "value_desc", "value_asc"]),
    filters: z
      .array(
        z.object({
          field: z.string().min(1, "Pick a field"),
          op: z.enum(["eq", "neq", "in", "not_in", "gt", "gte", "lt", "lte", "empty", "not_empty"]),
          value: z.string(),
        })
      )
      .max(10, "10 filters at most"),
  })
  .superRefine((form, ctx) => {
    form.filters.forEach((f, i) => {
      if (opTakesValue(f.op) && !f.value.trim()) {
        ctx.addIssue({ code: "custom", path: ["filters", i, "value"], message: "Enter a value" });
      }
    });
    if (form.group2 && form.group2 === form.group1) {
      ctx.addIssue({
        code: "custom",
        path: ["group2"],
        message: "Split by something other than the first grouping",
      });
    }
  });

export function panelToForm(panel: Panel | null, fallbackDataset: string): PanelForm {
  const q = panel?.query ?? emptyQuery(fallbackDataset);
  const [g1, g2] = q.group_by;
  return {
    title: panel?.title ?? "",
    viz: panel?.viz ?? "bar",
    dataset: q.dataset,
    measure: q.measure,
    group1: g1?.field ?? "",
    grain1: g1?.grain ?? "month",
    group2: g2?.field ?? "",
    grain2: g2?.grain ?? "month",
    sort: q.sort,
    filters: q.filters.map((f) => ({
      field: f.field,
      op: f.op,
      value:
        f.value === null || f.value === undefined
          ? ""
          : String(Array.isArray(f.value) ? f.value[0] : f.value),
    })),
  };
}

/**
 * The form back as a query. A grain is only sent for a date field; numbers are
 * sent as numbers. With `completeOnly`, filters still waiting for a value are
 * left out, which is what the live preview runs while the OC is typing.
 */
export function formToQuery(form: PanelForm, dataset: Dataset | undefined, completeOnly = false): QuerySpec {
  const group = (field: string, grain: Grain) =>
    fieldOf(dataset, field)?.kind === "date" ? { field, grain } : { field };
  const group_by = [
    form.group1 && group(form.group1, form.grain1),
    form.group1 && form.group2 && group(form.group2, form.grain2),
  ].filter((g): g is { field: string; grain?: Grain } => !!g);
  const filters = form.filters
    .filter((f) => f.field && (!completeOnly || !opTakesValue(f.op) || f.value.trim()))
    .map((f) => {
      if (!opTakesValue(f.op)) return { field: f.field, op: f.op };
      const kind = fieldOf(dataset, f.field)?.kind;
      const value =
        kind === "number" && f.value.trim() !== "" && !Number.isNaN(Number(f.value))
          ? Number(f.value)
          : f.value.trim();
      return { field: f.field, op: f.op, value };
    });
  return { dataset: form.dataset, measure: form.measure, group_by, filters, sort: form.sort, limit: 100 };
}
