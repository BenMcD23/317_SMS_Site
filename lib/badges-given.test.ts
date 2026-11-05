import { describe, expect, it } from "vitest";

import { badgeHistoryStatus } from "@/lib/badges-given";

describe("badgeHistoryStatus", () => {
  it("a give the badge is still out on is just Given", () => {
    expect(badgeHistoryStatus({ action: "given", current: true })).toBe("Given");
  });

  it("an older give that was taken back says so", () => {
    expect(badgeHistoryStatus({ action: "given", current: false })).toBe("Given, since undone");
  });

  it("the undo itself reads Undone", () => {
    expect(badgeHistoryStatus({ action: "undone", current: false })).toBe("Undone");
  });
});
