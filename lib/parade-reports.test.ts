import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addRecipient,
  buildReport,
  nightTitle,
  personLabel,
  removeRecipient,
  scheduleText,
  setReportsEnabled,
} from "@/lib/parade-reports";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe("nightTitle", () => {
  it("names the night the way people say it, with no comma", () => {
    expect(nightTitle("2026-11-25")).toBe("Wednesday 25 Nov 2026");
    expect(nightTitle("2026-11-27")).toBe("Friday 27 Nov 2026");
  });

  it("keeps the right day across the clock change", () => {
    expect(nightTitle("2026-03-29")).toBe("Sunday 29 Mar 2026");
  });
});

describe("scheduleText", () => {
  it("reads the API's schedule as a sentence", () => {
    expect(scheduleText({ days: ["wed", "fri"], hour: 21, minute: 30 })).toBe(
      "21:30 on Wednesday and Friday"
    );
    expect(scheduleText({ days: ["mon", "wed", "fri"], hour: 9, minute: 5 })).toBe(
      "09:05 on Monday, Wednesday and Friday"
    );
  });

  it("copes with no days rather than printing 'undefined'", () => {
    expect(scheduleText({ days: [], hour: 21, minute: 30 })).toBe("21:30");
  });
});

describe("personLabel", () => {
  it("falls back to the email for someone with no name on their account", () => {
    expect(personLabel({ email: "a@x", name: "Amy Able", role: "nco" })).toBe("Amy Able");
    expect(personLabel({ email: "a@x", name: null, role: "nco" })).toBe("a@x");
  });
});

describe("writes", () => {
  it("each sends the right method, path and body", async () => {
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => json({}));
    vi.stubGlobal("fetch", fetch);
    await setReportsEnabled("tok", true);
    await addRecipient("tok", "nco@x");
    await removeRecipient("tok", "nco+1@x");
    await buildReport("tok", "2026-11-25", true);
    const calls = fetch.mock.calls.map(([url, init]) => [url, init.method, init.body]);
    expect(calls).toEqual([
      ["/api/parade-reports/settings", "PUT", JSON.stringify({ enabled: true })],
      ["/api/parade-reports/recipients", "POST", JSON.stringify({ email: "nco@x" })],
      ["/api/parade-reports/recipients/nco%2B1%40x", "DELETE", undefined],
      ["/api/parade-reports", "POST", JSON.stringify({ date: "2026-11-25", email: true })],
    ]);
  });

  it("a refusal rejects with the API's own reason", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ detail: "They're already on the list" }, 409))
    );
    await expect(addRecipient("tok", "nco@x")).rejects.toThrow("They're already on the list");
  });

  it("a validation error isn't shown as [object Object]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({ detail: [{ loc: ["body", "date"], msg: "Input should be a valid date" }] }, 422)
      )
    );
    await expect(buildReport("tok", "", false)).rejects.toThrow("Input should be a valid date");
  });
});
