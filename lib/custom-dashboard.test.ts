import { describe, expect, it } from "vitest";

import {
  type Dataset,
  type Panel,
  type QuerySpec,
  GRID_COLS,
  MAX_SERIES,
  applyLayout,
  describeQuery,
  emptyQuery,
  filterOps,
  formatValue,
  keyLabel,
  layoutChanged,
  newPanelId,
  nextPosition,
  readingOrder,
  starterPanels,
  toChartData,
} from "@/lib/custom-dashboard";
import { flightColor } from "@/lib/stats";

const ATTENDANCE: Dataset = {
  key: "cadet_attendance",
  label: "Cadet attendance",
  description: "",
  time_field: "date",
  fields: [
    { key: "date", label: "Date", kind: "date" },
    { key: "state", label: "Present / authorised / absent", kind: "text" },
    { key: "flight", label: "Flight", kind: "text" },
    { key: "rank", label: "Rank", kind: "text" },
  ],
  measures: [
    { key: "count", label: "Number of records", unit: "" },
    { key: "turnout", label: "Turnout", unit: "%" },
  ],
};
const field = (key: string) => ATTENDANCE.fields.find((f) => f.key === key);
const spec = (rest: Partial<QuerySpec>): QuerySpec => ({ ...emptyQuery("cadet_attendance"), ...rest });

const panel = (id: string, x: number, y: number, w = 6, h = 4): Panel => ({
  id,
  title: id,
  viz: "bar",
  query: emptyQuery("cadets"),
  x,
  y,
  w,
  h,
});

describe("keyLabel", () => {
  it("says each date bucket the way a person would", () => {
    expect(keyLabel("2026-09-03", field("date"), "day")).toBe("3 Sept 2026");
    expect(keyLabel("2026-08-31", field("date"), "week")).toBe("w/c 31 Aug");
    expect(keyLabel("2026-09-01", field("date"), "month")).toBe("Sept 2026");
    expect(keyLabel("2026-01-01", field("date"), "year")).toBe("2026");
  });

  it("names blanks, badges, flights and lower-case states", () => {
    expect(keyLabel(null, field("flight"))).toBe("Not set");
    expect(keyLabel("", field("rank"))).toBe("Not set");
    expect(keyLabel("first_aid", { key: "qual_type", label: "Qualification", kind: "text" })).toBe(
      "First Aid"
    );
    expect(keyLabel("A", field("flight"))).toBe("A Flight");
    expect(keyLabel("present", field("state"))).toBe("Present");
  });

  it("formats numbers with separators", () => {
    expect(keyLabel(1500, { key: "minutes", label: "Minutes", kind: "number" })).toBe("1,500");
  });
});

describe("formatValue", () => {
  it("adds the measure's unit and keeps one decimal at most", () => {
    expect(formatValue(66.667, "%")).toBe("66.7%");
    expect(formatValue(45, "min")).toBe("45 min");
    expect(formatValue(1234, "")).toBe("1,234");
  });

  it("shows a dash when there's no answer (an average over nothing)", () => {
    expect(formatValue(null, "%")).toBe("—");
  });
});

describe("filterOps", () => {
  it("only lets text be matched, and lets dates and numbers be compared", () => {
    expect(filterOps("text").map((o) => o.value)).not.toContain("gte");
    expect(filterOps("date").map((o) => o.value)).toContain("gte");
    expect(filterOps("number").map((o) => o.value)).toContain("lte");
  });
});

describe("describeQuery", () => {
  it("reads as a sentence", () => {
    expect(
      describeQuery(
        spec({
          measure: "turnout",
          group_by: [{ field: "date", grain: "week" }, { field: "flight" }],
          filters: [{ field: "rank", op: "eq", value: "Cadet" }],
        }),
        ATTENDANCE
      )
    ).toBe("Cadet attendance: turnout by date (week), split by flight · 1 filter");
    expect(describeQuery(spec({}), ATTENDANCE)).toBe("Cadet attendance: number of records");
  });

  it("says so when the dataset has gone, rather than crashing", () => {
    expect(describeQuery(spec({}), undefined)).toBe("Dataset no longer available");
  });
});

describe("toChartData", () => {
  it("one grouping is one series named by the measure", () => {
    const chart = toChartData(
      [
        { keys: ["2026-09-01"], value: 50 },
        { keys: ["2026-10-01"], value: 66.67 },
      ],
      spec({ measure: "turnout", group_by: [{ field: "date", grain: "month" }] }),
      ATTENDANCE
    );
    expect(chart.data).toEqual([
      { x: "Sept 2026", value: 50 },
      { x: "Oct 2026", value: 66.67 },
    ]);
    expect(chart.series).toEqual([{ id: "value", label: "Turnout", colour: "var(--chart-1)" }]);
    expect(chart.hidden).toBe(0);
  });

  it("a second grouping becomes one series per value, filled in per x", () => {
    const chart = toChartData(
      [
        { keys: ["2026-09-01", "present"], value: 4 },
        { keys: ["2026-09-01", "absent"], value: 2 },
        { keys: ["2026-10-01", "present"], value: 3 },
      ],
      spec({ group_by: [{ field: "date", grain: "month" }, { field: "state" }] }),
      ATTENDANCE
    );
    expect(chart.series.map((s) => s.label)).toEqual(["Absent", "Present"]);
    expect(chart.data).toEqual([
      { x: "Sept 2026", "s:present": 4, "s:absent": 2 },
      { x: "Oct 2026", "s:present": 3 },
    ]);
  });

  it(`keeps the ${MAX_SERIES} biggest series and counts the rest as hidden`, () => {
    const ranks = ["Cadet", "Cpl", "Sgt", "FS", "CWO", "LCpl"];
    const rows = ranks.map((r, i) => ({ keys: ["2026-09-01", r], value: 10 - i }));
    const chart = toChartData(rows, spec({ group_by: [{ field: "date" }, { field: "rank" }] }), ATTENDANCE);
    expect(chart.series).toHaveLength(MAX_SERIES);
    expect(chart.series.map((s) => s.label)).not.toContain("CWO");
    expect(chart.hidden).toBe(2);
    // Every kept series has its own hue.
    expect(new Set(chart.series.map((s) => s.colour)).size).toBe(MAX_SERIES);
  });

  it("flights keep the colours every other chart gives them, in flight order", () => {
    const chart = toChartData(
      [
        { keys: ["2026-09-01", "C"], value: 1 },
        { keys: ["2026-09-01", "A"], value: 5 },
        { keys: ["2026-09-01", null], value: 2 },
      ],
      spec({ group_by: [{ field: "date" }, { field: "flight" }] }),
      ATTENDANCE
    );
    expect(chart.series.map((s) => s.label)).toEqual(["A Flight", "C Flight", "Not set"]);
    expect(chart.series[0].colour).toBe(flightColor("A"));
    expect(chart.series[1].colour).toBe(flightColor("C"));
  });

  it("colours follow the label, not the size, so a growing series doesn't swap colours", () => {
    const q = spec({ group_by: [{ field: "date" }, { field: "state" }] });
    const colourOf = (rows: { keys: string[]; value: number }[], label: string) =>
      toChartData(rows, q, ATTENDANCE).series.find((s) => s.label === label)?.colour;
    const before = [
      { keys: ["2026-09-01", "absent"], value: 1 },
      { keys: ["2026-09-01", "present"], value: 9 },
    ];
    const after = [
      { keys: ["2026-09-01", "absent"], value: 9 },
      { keys: ["2026-09-01", "present"], value: 1 },
    ];
    expect(colourOf(after, "Absent")).toBe(colourOf(before, "Absent"));
    expect(colourOf(after, "Present")).toBe(colourOf(before, "Present"));
  });
});

describe("layout helpers", () => {
  it("puts a new panel under everything already there", () => {
    expect(nextPosition([])).toEqual({ x: 0, y: 0 });
    expect(nextPosition([panel("a", 0, 0, 6, 4), panel("b", 6, 0, 6, 7)])).toEqual({ x: 0, y: 7 });
  });

  it("stacks panels top to bottom, then left to right, for a phone", () => {
    const order = readingOrder([panel("c", 0, 5), panel("b", 6, 0), panel("a", 0, 0)]);
    expect(order.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("applies the grid's boxes and leaves panels it didn't mention alone", () => {
    const panels = [panel("a", 0, 0), panel("b", 6, 0)];
    const next = applyLayout(panels, [{ i: "a", x: 2, y: 3, w: 4, h: 2 }]);
    expect(next[0]).toMatchObject({ x: 2, y: 3, w: 4, h: 2 });
    expect(next[1]).toEqual(panels[1]);
  });

  it("never lets a panel run off the right of the grid (the API refuses it)", () => {
    const [p] = applyLayout([panel("a", 0, 0)], [{ i: "a", x: 9, y: 0, w: 6, h: 2 }]);
    expect(p.x + p.w).toBe(GRID_COLS);
  });

  it("only reports a change when something actually moved", () => {
    const panels = [panel("a", 0, 0)];
    expect(layoutChanged(panels, applyLayout(panels, [{ i: "a", x: 0, y: 0, w: 6, h: 4 }]))).toBe(false);
    expect(layoutChanged(panels, applyLayout(panels, [{ i: "a", x: 0, y: 0, w: 6, h: 5 }]))).toBe(true);
  });

  it("makes ids the API accepts, and never the same twice", () => {
    const ids = Array.from({ length: 50 }, newPanelId);
    expect(new Set(ids).size).toBe(50);
    expect(ids.every((id) => /^[A-Za-z0-9_-]{1,40}$/.test(id))).toBe(true);
  });

  it("the examples fit the grid and don't overlap", () => {
    const panels = starterPanels();
    expect(new Set(panels.map((p) => p.id)).size).toBe(panels.length);
    for (const p of panels) expect(p.x + p.w).toBeLessThanOrEqual(GRID_COLS);
    const overlaps = (a: Panel, b: Panel) =>
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    for (const a of panels) for (const b of panels) if (a !== b) expect(overlaps(a, b)).toBe(false);
  });
});
