import { describe, expect, it } from "vitest";

import { contactAuditOrNull, filterCadets, resultCounts, type ContactAuditCadet } from "@/lib/contact-audit";

const row = (cin: number, result: ContactAuditCadet["result"], flight: string | null) =>
  ({ cin, result, flight }) as ContactAuditCadet;

const CADETS = [row(1, "good", "A"), row(2, "bad", "A"), row(3, "bad", "B"), row(4, "not_checked", null)];

describe("contact audit helpers", () => {
  it("counts each result", () => {
    expect(resultCounts(CADETS)).toEqual({ good: 1, bad: 2, not_checked: 1 });
    expect(resultCounts([])).toEqual({ good: 0, bad: 0, not_checked: 0 });
  });

  it("filters by result and flight together", () => {
    expect(filterCadets(CADETS, "bad", "").map((c) => c.cin)).toEqual([2, 3]);
    expect(filterCadets(CADETS, "bad", "B").map((c) => c.cin)).toEqual([3]);
    expect(filterCadets(CADETS, "all", "A").map((c) => c.cin)).toEqual([1, 2]);
    expect(filterCadets(CADETS, "all", "").length).toBe(4);
  });

  it("an error body or a list where the audit was expected is null, not a crash", () => {
    expect(contactAuditOrNull({ detail: "Staff only" })).toBeNull();
    expect(contactAuditOrNull([])).toBeNull();
    expect(contactAuditOrNull(null)).toBeNull();
    expect(contactAuditOrNull({ checks: [], cadets: [] })).toEqual({ checks: [], cadets: [] });
  });
});
