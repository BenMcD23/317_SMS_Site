import { describe, expect, it } from "vitest";

import {
  groupSizeLabel,
  kindLabel,
  kitSchema,
  kitSummary,
  taskFormFrom,
  taskLabel,
  taskPayload,
  taskSchema,
  type BankTask,
} from "@/lib/session-planner";

const TASK: BankTask = {
  id: 3,
  kind: "leadership",
  number: "7",
  name: "Toxic Barrel",
  brief: "",
  duration_minutes: 20,
  min_group: 4,
  max_group: 6,
  active: true,
  kit: [
    { kit_id: 1, name: "Oil drum", quantity: 1, in_stock: 2 },
    { kit_id: 2, name: "Rope", quantity: 4, in_stock: 6 },
  ],
  kit_short: [],
  led_count: 0,
  passed_count: 0,
  cadets_led: 0,
};

describe("labels", () => {
  it("puts a task's number before its name, and leaves an unnumbered one alone", () => {
    expect(taskLabel({ number: "7", name: "Toxic Barrel" })).toBe("7. Toxic Barrel");
    expect(taskLabel({ number: null, name: "Stretcher Carry" })).toBe("Stretcher Carry");
  });

  it.each([
    [4, 6, "4–6 cadets"],
    [5, 5, "5 cadets"],
    [null, 6, "Up to 6"],
    [4, null, "At least 4"],
    [null, null, "Any size"],
  ])("describes a group of %s to %s as %s", (min, max, label) => {
    expect(groupSizeLabel(min, max)).toBe(label);
  });

  it("only counts kit there's more than one of", () => {
    expect(kitSummary(TASK.kit)).toBe("Oil drum, 4 × Rope");
    expect(kitSummary([])).toBe("");
  });

  it("names a kind of session, and passes through one it doesn't know", () => {
    expect(kindLabel("first_aid")).toBe("First aid");
    expect(kindLabel("knitting")).toBe("knitting");
  });
});

describe("the task form", () => {
  const valid = taskFormFrom(TASK);

  it("starts a new task as the kind the bank is showing, 15 minutes and no kit", () => {
    expect(taskFormFrom(null, "radio")).toMatchObject({ kind: "radio", duration: 15, kit: [], active: true });
  });

  it("round-trips a task through the form unchanged", () => {
    expect(taskPayload(taskSchema.parse(valid))).toEqual({
      kind: "leadership",
      number: "7",
      name: "Toxic Barrel",
      brief: "",
      duration_minutes: 20,
      min_group: 4,
      max_group: 6,
      active: true,
      kit: [
        { kit_id: 1, quantity: 1 },
        { kit_id: 2, quantity: 4 },
      ],
    });
  });

  it("sends blank group sizes and number as null", () => {
    const body = taskPayload({ ...valid, number: "  ", minGroup: "", maxGroup: "" });
    expect(body).toMatchObject({ number: null, min_group: null, max_group: null });
  });

  it.each([
    [{ name: "  " }, "name", "Give the task a name"],
    [{ duration: 0 }, "duration", "At least 1 minute"],
    [{ duration: 241 }, "duration", "240 minutes at most"],
    [{ duration: Number.NaN }, "duration", "Enter how many minutes it takes"],
    [{ minGroup: "0" }, "minGroup", "A number from 1 to 50, or leave it blank"],
    [{ maxGroup: "six" }, "maxGroup", "A number from 1 to 50, or leave it blank"],
    [{ minGroup: "7", maxGroup: "3" }, "maxGroup", "Can't be smaller than the smallest group"],
  ])("refuses %o with a message saying what to do", (over, path, message) => {
    const result = taskSchema.safeParse({ ...valid, ...over });
    expect(result.success).toBe(false);
    const issue = result.error?.issues.find((i) => i.path[0] === path);
    expect(issue?.message).toBe(message);
  });

  it("refuses kit with a quantity under 1", () => {
    const result = taskSchema.safeParse({ ...valid, kit: [{ kitId: 1, quantity: 0 }] });
    expect(result.error?.issues[0].message).toBe("At least 1");
  });
});

describe("the kit form", () => {
  it("allows none working, but not negative or fractional amounts", () => {
    expect(kitSchema.safeParse({ name: "Radio", quantity: 0, notes: "" }).success).toBe(true);
    expect(kitSchema.safeParse({ name: "Radio", quantity: -1, notes: "" }).error?.issues[0].message).toBe(
      "Can't be negative"
    );
    expect(kitSchema.safeParse({ name: "Radio", quantity: 1.5, notes: "" }).error?.issues[0].message).toBe(
      "Whole items only"
    );
    expect(kitSchema.safeParse({ name: " ", quantity: 1, notes: "" }).error?.issues[0].message).toBe(
      "Give the kit a name"
    );
  });
});
