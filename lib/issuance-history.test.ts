import { describe, expect, it } from "vitest";

import { issuanceRecordHref, issuanceStatus } from "@/lib/issuance-history";

describe("issuanceStatus", () => {
  it("an undone give is undone even if nothing has replaced it", () => {
    expect(issuanceStatus({ current: false, undoneAt: "2026-11-01T10:00:00" })).toBe("undone");
  });

  it("the give the record shows is current; an older one still standing was replaced", () => {
    expect(issuanceStatus({ current: true, undoneAt: null })).toBe("current");
    expect(issuanceStatus({ current: false, undoneAt: null })).toBe("replaced");
  });
});

describe("issuanceRecordHref", () => {
  it("links a cadet to their uniform tab", () => {
    expect(issuanceRecordHref({ subjectType: "cadet", cadetCin: 1001 })).toBe("/cadets/1001?tab=uniform");
  });

  it("an adult, or a cadet whose record has gone, has nothing to link to", () => {
    expect(issuanceRecordHref({ subjectType: "user", cadetCin: null })).toBeUndefined();
    expect(issuanceRecordHref({ subjectType: "cadet", cadetCin: null })).toBeUndefined();
  });
});
