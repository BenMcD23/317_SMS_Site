import { describe, expect, it } from "vitest";

import {
  byUrgency,
  complianceCounts,
  itemsToChase,
  type ComplianceItem,
  type StaffCompliance,
} from "@/lib/staff-compliance";

const item = (
  name: string,
  status: ComplianceItem["status"],
  expires: string | null = null
): ComplianceItem => ({
  key: name,
  name,
  kind: "training",
  achieved: null,
  expires,
  status,
});
const person = (cin: number, name: string, status: StaffCompliance["status"]): StaffCompliance => ({
  cin,
  name,
  rank: null,
  items: status ? [] : null,
  status,
  synced_at: null,
});

describe("itemsToChase", () => {
  it("leaves out what's up to date and lists lapsed, then not done, then soonest due", () => {
    const items = [
      item("Fire", "ok", "2030-01-01"),
      item("Safeguarding", "expiring", "2026-12-20"),
      item("DBS", "expiring", "2026-12-01"),
      item("Prevent", "missing"),
      item("Data", "expired", "2026-01-01"),
    ];
    expect(itemsToChase(items).map((i) => i.name)).toEqual(["Data", "Prevent", "DBS", "Safeguarding"]);
  });

  it("treats never synced as nothing to chase", () => {
    expect(itemsToChase(null)).toEqual([]);
  });
});

describe("byUrgency", () => {
  it("puts the worst first and never-synced last, then by name", () => {
    const staff = [
      person(1, "Zed", "ok"),
      person(2, "Pat", null),
      person(3, "Amy", "expiring"),
      person(4, "Bob", "expired"),
      person(5, "Ann", "expiring"),
    ];
    expect(byUrgency(staff).map((s) => s.name)).toEqual(["Bob", "Amy", "Ann", "Zed", "Pat"]);
  });
});

describe("complianceCounts", () => {
  it("counts people by their worst status", () => {
    expect(
      complianceCounts([
        person(1, "A", "ok"),
        person(2, "B", "expired"),
        person(3, "C", null),
        person(4, "D", "missing"),
      ])
    ).toEqual({ expired: 1, missing: 1, expiring: 0, ok: 1, unsynced: 1 });
  });
});
