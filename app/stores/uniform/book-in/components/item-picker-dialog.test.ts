import { describe, expect, it } from "vitest";

import { sizeFromLabel } from "@/app/stores/uniform/book-in/components/item-picker-dialog";

describe("sizeFromLabel", () => {
  const shirts = ["110/4", "110/40", "95/36"];

  it("finds the catalogue size a printed size starts with", () => {
    // The bag in the photo printed "110/40(16´)": chest/collar, then inches.
    expect(sizeFromLabel("110/40(16´)", shirts)).toBe("110/40");
  });

  it("prefers the longest match, so 110/40 isn't read as 110/4", () => {
    expect(sizeFromLabel("110/40", shirts)).toBe("110/40");
  });

  it("ignores spaces and case", () => {
    expect(sizeFromLabel(" 95 / 36 ", shirts)).toBe("95/36");
    expect(sizeFromLabel("short", ["Short", "Standard"])).toBe("Short");
  });

  it("leaves the size empty when nothing matches or nothing was read", () => {
    // The sewn-in label's "35/96 Collar" is collar/chest, the other way round.
    expect(sizeFromLabel("35/96 Collar", shirts)).toBe("");
    expect(sizeFromLabel(null, shirts)).toBe("");
    expect(sizeFromLabel("110/40", [])).toBe("");
  });
});
