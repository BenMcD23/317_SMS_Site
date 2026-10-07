import { describe, expect, it } from "vitest";

import { formatDate, formatMonth, formatShortDate, formatTimestamp } from "@/lib/format";

describe("formatDate", () => {
  it("formats an ISO date the British way", () => {
    expect(formatDate("2026-01-05")).toBe("5 Jan 2026");
    expect(formatDate("2026-12-31T23:30:00")).toBe("31 Dec 2026");
  });

  it("uses the fallback for missing dates", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
    expect(formatDate(null, "Never")).toBe("Never");
  });

  it("does not throw on garbage", () => {
    expect(formatDate("not a date")).toBe("Invalid Date");
  });
});

describe("formatShortDate", () => {
  it("drops the year", () => {
    expect(formatShortDate("2026-03-04")).toBe("4 Mar");
    expect(formatShortDate(null, "-")).toBe("-");
  });
});

describe("formatTimestamp", () => {
  it("is a 24-hour timestamp with a two-digit day", () => {
    expect(formatTimestamp("2026-01-05T19:30:00")).toBe("05 Jan 2026, 19:30");
  });

  it("shows UK local time across the clocks changing", () => {
    // 01:30 UTC on the first day of BST is 02:30 in London.
    expect(formatTimestamp("2026-03-29T01:30:00Z")).toBe("29 Mar 2026, 02:30");
  });
});

describe("todayLocal", () => {
  it("is the local calendar date, not the UTC one", async () => {
    const { todayLocal } = await import("@/lib/format");
    // 23:30 UTC on 30 June is 00:30 on 1 July in London.
    expect(todayLocal(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    // In winter London is on UTC.
    expect(todayLocal(new Date("2026-01-05T23:30:00Z"))).toBe("2026-01-05");
    expect(todayLocal(new Date(2026, 0, 9))).toBe("2026-01-09");
  });
});

describe("formatMonth", () => {
  it("names an intake month", () => {
    expect(formatMonth("2026-09")).toBe("Sept 2026");
    expect(formatMonth("2027-01")).toBe("Jan 2027");
  });
});
