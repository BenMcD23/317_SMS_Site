import { describe, expect, it } from "vitest";

import { deletedKindPage } from "@/lib/deleted-records";

describe("deletedKindPage", () => {
  it("sends each kind to the page it lives on", () => {
    expect(deletedKindPage("uniform_order")?.href).toBe("/stores/uniform/orders");
    expect(deletedKindPage("logs_form_entry")?.href).toBe("/stores/uniform/orders");
    expect(deletedKindPage("badge_order_list_entry")?.href).toBe("/stores/badges/orders");
  });

  it("has no page for a kind it doesn't know", () => {
    expect(deletedKindPage("mystery")).toBeUndefined();
  });
});
