import { describe, expect, it } from "vitest";

import { daysLeft, recruitName, statusLabel, statusTone } from "@/lib/recruits";

describe("recruit status", () => {
  it.each([
    [{ status: "not_started", expired: false }, "Not opened", "muted"],
    [{ status: "opened", expired: false }, "Opened", "muted"],
    [{ status: "in_progress", expired: false }, "In progress", "muted"],
    [{ status: "in_progress", expired: true }, "Link expired", "warning"],
    [{ status: "not_started", expired: true }, "Link expired", "warning"],
    // A submitted form's link going stale doesn't matter any more.
    [{ status: "submitted", expired: true }, "Submitted", "success"],
  ] as const)("%o reads %s", (r, label, tone) => {
    expect(statusLabel(r)).toBe(label);
    expect(statusTone(r)).toBe(tone);
  });
});

describe("daysLeft", () => {
  // November: clear of the October clock change, which would add an hour.
  const now = new Date("2026-11-02T12:00:00");
  it("counts whole days to the expiry", () => {
    expect(daysLeft("2026-11-16T12:00:00", now)).toBe(14);
    expect(daysLeft("2026-11-16T11:00:00", now)).toBe(13);
  });
  it("is 0 on the last day and negative once gone", () => {
    expect(daysLeft("2026-11-02T20:00:00", now)).toBe(0);
    expect(daysLeft("2026-10-31T12:00:00", now)).toBe(-2);
  });
});

it("names a recruit first name first", () => {
  expect(recruitName({ cadetFirstName: "Zoë", cadetLastName: "Ó Briain" })).toBe("Zoë Ó Briain");
});
