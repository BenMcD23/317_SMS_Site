import { describe, expect, it } from "vitest";

import type { CommitteeRequestDetail } from "@/lib/committee";
import {
  committeeRequestSchema,
  emptyRequest,
  formToPayload,
  lineTotal,
  requestToForm,
  requestTotal,
} from "@/lib/committee-form";

describe("lineTotal", () => {
  it("rounds to the penny rather than showing float noise", () => {
    expect(lineTotal(3, 0.1)).toBe(0.3);
    expect(lineTotal(3, 24.99)).toBe(74.97);
  });

  it("is NaN while quantity or unit cost is still empty", () => {
    expect(lineTotal(2, NaN)).toBeNaN();
    expect(lineTotal(NaN, 5)).toBeNaN();
  });
});

it("requestTotal skips lines that aren't filled in yet", () => {
  expect(requestTotal([{ total: 10 }, { total: NaN }, { total: 2.5 }])).toBe(12.5);
  expect(requestTotal([])).toBe(0);
});

describe("committeeRequestSchema", () => {
  const valid = {
    title: "Radios",
    justification: "",
    items: [{ description: "Radio", details: "", quantity: 2, unitCost: 10, total: 20 }],
  };
  const messages = (v: unknown) => {
    const r = committeeRequestSchema.safeParse(v);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  it("accepts a filled-in request, including a total that isn't qty × unit", () => {
    expect(messages(valid)).toEqual([]);
    expect(messages({ ...valid, items: [{ ...valid.items[0], total: 18 }] })).toEqual([]);
  });

  it("says what to do for each missing or bad value", () => {
    expect(messages({ ...valid, title: "  " })).toEqual(["Give the request a title"]);
    expect(messages({ ...valid, items: [] })).toEqual(["Add at least one item"]);
    expect(messages(emptyRequest())).toEqual(
      expect.arrayContaining(["Give the request a title", "Say what the item is", "Enter an amount"])
    );
    const item = valid.items[0];
    expect(messages({ ...valid, items: [{ ...item, quantity: 0 }] })).toEqual(["At least 1"]);
    expect(messages({ ...valid, items: [{ ...item, quantity: 1.5 }] })).toEqual(["Whole numbers only"]);
    expect(messages({ ...valid, items: [{ ...item, unitCost: -1 }] })).toEqual(["Can't be negative"]);
  });
});

it("round-trips a stored request into the form and back into the API's shape", () => {
  const req = {
    title: "Radios",
    justification: "For the radio badge",
    items: [{ description: "Radio", details: "Licence-free", quantity: 3, unit_cost: 25, cost: 70 }],
  } as CommitteeRequestDetail;
  const form = requestToForm(req);
  expect(form.items).toEqual([
    { description: "Radio", details: "Licence-free", quantity: 3, unitCost: 25, total: 70 },
  ]);
  // Trims the item's description as well as its name.
  const padded = { ...form, title: "  Radios  ", items: [{ ...form.items[0], details: " Licence-free " }] };
  expect(formToPayload(padded)).toEqual({
    title: "Radios",
    justification: "For the radio badge",
    items: [{ description: "Radio", details: "Licence-free", quantity: 3, unit_cost: 25, cost: 70 }],
  });
});
