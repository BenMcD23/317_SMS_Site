import { describe, expect, it } from "vitest";

import { canAccess } from "@/lib/access";

describe("canAccess", () => {
  it("lets staff reach everything", () => {
    for (const path of ["/", "/stores/uniform/orders", "/assessments/inspection", "/api-logs", "/oc"]) {
      expect(canAccess("staff", path)).toBe(true);
    }
  });

  it.each([
    "/",
    "/assessments",
    "/assessments/leadership",
    "/cadets/assessments",
    "/session-plans",
    "/session-plans/12/edit",
    "/nco-holidays",
    "/nco-comments",
    "/settings",
  ])("lets NCOs and SNCOs reach %s", (path) => {
    expect(canAccess("nco", path)).toBe(true);
    expect(canAccess("snco", path)).toBe(true);
  });

  it.each(["/cadets", "/cadets/123", "/stores", "/texts/messages", "/committee/requests", "/oc", "/backups"])(
    "keeps NCOs and SNCOs out of %s",
    (path) => {
      expect(canAccess("nco", path)).toBe(false);
      expect(canAccess("snco", path)).toBe(false);
    }
  );

  it("gives inspections to SNCOs but not NCOs", () => {
    expect(canAccess("snco", "/assessments/inspection")).toBe(true);
    expect(canAccess("snco", "/assessments/inspection/history")).toBe(true);
    expect(canAccess("nco", "/assessments/inspection")).toBe(false);
  });

  it("matches whole path segments, not prefixes", () => {
    // "/settings-export" is not under "/settings".
    expect(canAccess("nco", "/settings-export")).toBe(false);
    expect(canAccess("nco", "/assessmentsX")).toBe(false);
    expect(canAccess("snco", "/assessments/inspectionX")).toBe(true); // still under /assessments
  });

  it("treats no role or an unknown role as an NCO-at-most", () => {
    expect(canAccess(undefined, "/")).toBe(true);
    expect(canAccess(undefined, "/cadets")).toBe(false);
    expect(canAccess("cadet", "/stores")).toBe(false);
    expect(canAccess(undefined, "/assessments/inspection")).toBe(false);
  });
});
