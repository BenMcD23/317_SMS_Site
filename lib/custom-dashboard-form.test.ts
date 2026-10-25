import { describe, expect, it } from "vitest";

import { type Dataset, type Panel } from "@/lib/custom-dashboard";
import { type PanelForm, formToQuery, panelFormSchema, panelToForm } from "@/lib/custom-dashboard-form";

const FLYING: Dataset = {
  key: "flying",
  label: "Flying",
  description: "",
  time_field: "date",
  fields: [
    { key: "date", label: "Date", kind: "date" },
    { key: "activity", label: "Activity", kind: "text" },
    { key: "minutes", label: "Minutes", kind: "number" },
  ],
  measures: [{ key: "minutes", label: "Total minutes", unit: "min" }],
};

const PANEL: Panel = {
  id: "p1",
  title: "Minutes by month",
  viz: "line",
  x: 0,
  y: 0,
  w: 6,
  h: 4,
  query: {
    dataset: "flying",
    measure: "minutes",
    group_by: [{ field: "date", grain: "week" }, { field: "activity" }],
    filters: [
      { field: "minutes", op: "gte", value: 20 },
      { field: "activity", op: "not_empty" },
    ],
    sort: "value_desc",
    limit: 100,
  },
};

const form = (rest: Partial<PanelForm>): PanelForm => ({
  ...panelToForm(null, "flying"),
  title: "T",
  ...rest,
});
const errors = (f: PanelForm) => {
  const r = panelFormSchema.safeParse(f);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("panel form", () => {
  it("a panel survives the trip through the form unchanged", () => {
    expect(formToQuery(panelToForm(PANEL, "cadets"), FLYING)).toEqual(PANEL.query);
  });

  it("a new panel starts on the first dataset, counting, ungrouped", () => {
    const f = panelToForm(null, "cadets");
    expect(f).toMatchObject({ title: "", dataset: "cadets", measure: "count", group1: "", filters: [] });
  });

  it("only sends a grain for a date field", () => {
    const q = formToQuery(form({ group1: "activity", grain1: "day" }), FLYING);
    expect(q.group_by).toEqual([{ field: "activity" }]);
  });

  it("drops the split when there's no first grouping", () => {
    expect(formToQuery(form({ group1: "", group2: "activity" }), FLYING).group_by).toEqual([]);
  });

  it("sends a number field's value as a number", () => {
    const q = formToQuery(form({ filters: [{ field: "minutes", op: "gte", value: "30" }] }), FLYING);
    expect(q.filters).toEqual([{ field: "minutes", op: "gte", value: 30 }]);
  });

  it("the preview leaves out filters still waiting for a value; the save keeps them", () => {
    const f = form({
      filters: [
        { field: "activity", op: "eq", value: "" },
        { field: "activity", op: "empty", value: "" },
      ],
    });
    expect(formToQuery(f, FLYING, true).filters).toEqual([{ field: "activity", op: "empty" }]);
    expect(formToQuery(f, FLYING).filters).toHaveLength(2);
  });

  it("needs a title", () => {
    expect(errors(form({ title: "  " }))).toEqual(["title: Give the panel a title"]);
    expect(errors(form({ title: "x".repeat(81) }))).toEqual(["title: 80 characters at most"]);
  });

  it("needs a value for a filter that compares", () => {
    expect(errors(form({ filters: [{ field: "activity", op: "eq", value: " " }] }))).toEqual([
      "filters.0.value: Enter a value",
    ]);
    expect(errors(form({ filters: [{ field: "activity", op: "not_empty", value: "" }] }))).toEqual([]);
  });

  it("won't split by the same field it groups by", () => {
    expect(errors(form({ group1: "activity", group2: "activity" }))).toEqual([
      "group2: Split by something other than the first grouping",
    ]);
  });

  it("refuses more than 10 filters, the API's limit", () => {
    const filters = Array.from({ length: 11 }, () => ({
      field: "activity",
      op: "empty" as const,
      value: "",
    }));
    expect(errors(form({ filters }))).toEqual(["filters: 10 filters at most"]);
  });
});
