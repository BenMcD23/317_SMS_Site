// The lib/ write helpers are thin wrappers over apiRequest: each test pins the
// URL and method they hit (the backend contract) and the pure logic beside them.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

import { API_BASE } from "@/lib/config";
import * as holidays from "@/lib/nco-holidays";
import * as comments from "@/lib/nco-comments";
import * as appraisals from "@/lib/nco-appraisals";
import * as plans from "@/lib/session-plans-api";
import { contentOf, EMPTY_PLAN, missingForSubmit, type SessionPlanDetail } from "@/lib/session-plans";
import { formatDate, formatDateTime, formatGBP, STATUS_LABELS, STATUS_STYLE } from "@/lib/committee";

let calls: { url: string; method: string; body: unknown; headers: Record<string, string> }[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url,
        method: init.method ?? "GET",
        body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
        headers: (init.headers ?? {}) as Record<string, string>,
      });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );
});

const last = () => calls[calls.length - 1];

describe("API routes hit by the write helpers", () => {
  it.each([
    [
      "book holiday",
      () => holidays.bookHoliday("t", { date_from: "a", date_to: "b", reason: "" }),
      "POST",
      "/nco-holidays",
    ],
    [
      "edit holiday",
      () => holidays.editHoliday("t", 3, { date_from: "a", date_to: "b", reason: "" }),
      "PATCH",
      "/nco-holidays/3",
    ],
    ["cancel holiday", () => holidays.cancelHoliday("t", 3), "POST", "/nco-holidays/3/cancel"],
    ["sync holiday", () => holidays.syncHoliday("t", 3), "POST", "/nco-holidays/3/sync"],
    [
      "create comment",
      () => comments.createComment("t", { subject: "s", body: "b", comment_date: "d", cadet_cin: null }),
      "POST",
      "/nco-comments",
    ],
    ["delete comment", () => comments.deleteComment("t", 4), "DELETE", "/nco-comments/4"],
    ["add reply", () => comments.addReply("t", 4, "hi"), "POST", "/nco-comments/4/replies"],
    ["delete reply", () => comments.deleteReply("t", 4, 9), "DELETE", "/nco-comments/4/replies/9"],
    [
      "create appraisal",
      () => appraisals.createAppraisal("t", appraisals.emptyDraft()),
      "POST",
      "/nco-appraisals",
    ],
    [
      "update appraisal",
      () => appraisals.updateAppraisal("t", 5, appraisals.emptyDraft()),
      "PUT",
      "/nco-appraisals/5",
    ],
    ["delete appraisal", () => appraisals.deleteAppraisal("t", 5), "DELETE", "/nco-appraisals/5"],
    [
      "ai draft",
      () => appraisals.draftWithAi("t", { cadet_id: 1, points: "p" }),
      "POST",
      "/nco-appraisals/ai",
    ],
    [
      "save reminder",
      () => appraisals.saveReminder("t", { cadet_id: 1, due_date: "d", note: "" }),
      "POST",
      "/nco-appraisals/reminders",
    ],
    ["delete reminder", () => appraisals.deleteReminder("t", 6), "DELETE", "/nco-appraisals/reminders/6"],
    ["email appraisal", () => appraisals.emailAppraisal("t", 5, {}), "POST", "/nco-appraisals/5/email"],
    ["new plan", () => plans.savePlan("t", EMPTY_PLAN), "POST", "/session-plans"],
    ["save plan", () => plans.savePlan("t", EMPTY_PLAN, 7), "PUT", "/session-plans/7"],
    ["submit plan", () => plans.submitPlan("t", 7), "POST", "/session-plans/7/submit"],
    [
      "approve plan",
      () => plans.reviewPlan("t", 7, "approve", { note: "", feedback: {} }),
      "POST",
      "/session-plans/7/approve",
    ],
    [
      "send back",
      () => plans.reviewPlan("t", 7, "request-amendments", { note: "x", feedback: {} }),
      "POST",
      "/session-plans/7/request-amendments",
    ],
    ["plan comment", () => plans.addComment("t", 7, "x"), "POST", "/session-plans/7/comments"],
    ["delete plan comment", () => plans.deleteComment("t", 7, 2), "DELETE", "/session-plans/7/comments/2"],
    ["delete plan", () => plans.deletePlan("t", 7), "DELETE", "/session-plans/7"],
    [
      "delete attachment",
      () => plans.deleteAttachment("t", 7, 8),
      "DELETE",
      "/session-plans/7/attachments/8",
    ],
  ])("%s", async (_, call, method, path) => {
    await call();
    expect(last().url).toBe(`${API_BASE}${path}`);
    expect(last().method).toBe(method);
    expect(last().headers.Authorization).toBe("Bearer t");
  });

  it("uploads attachments as multipart without forcing a content type", async () => {
    await plans.uploadAttachments("t", 7, [new File(["x"], "map.png", { type: "image/png" })]);
    expect(last().url).toBe(`${API_BASE}/session-plans/7/attachments`);
    expect(last().body).toBeInstanceOf(FormData);
    expect(last().headers["Content-Type"]).toBeUndefined();
  });

  it("an upload rejection carries the API's message, flattened", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ detail: [{ msg: "only PNG, JPEG, WebP or PDF" }] }), { status: 422 })
        )
    );
    await expect(plans.uploadAttachments("t", 7, [])).rejects.toThrow("only PNG, JPEG, WebP or PDF");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(plans.uploadAttachments("t", 7, [])).rejects.toThrow("Server unreachable.");
  });

  it("a 422 from any helper reads as a sentence, not [object Object]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: [{ msg: "Input should be a valid date" }] }), { status: 422 })
      )
    );
    await expect(holidays.bookHoliday("t", { date_from: "x", date_to: "y", reason: "" })).rejects.toThrow(
      "Input should be a valid date"
    );
    await expect(
      comments.createComment("t", { subject: "", body: "", comment_date: "x", cadet_cin: null })
    ).rejects.toThrow("Input should be a valid date");
  });
});

describe("nco holidays", () => {
  const base = { cancelled: false, on_calendar: true } as holidays.NcoHoliday;

  it("needsSync when the calendar disagrees with the record", () => {
    expect(holidays.needsSync(base)).toBe(false);
    expect(holidays.needsSync({ ...base, on_calendar: false })).toBe(true);
    expect(holidays.needsSync({ ...base, cancelled: true, on_calendar: true })).toBe(true);
    expect(holidays.needsSync({ ...base, cancelled: true, on_calendar: false })).toBe(false);
  });

  it.each([
    ["2026-03-01", "2026-03-01", 1],
    ["2026-03-01", "2026-03-07", 7],
    // Across the clocks going forward: still whole days.
    ["2026-03-28", "2026-03-30", 3],
    ["2026-03-28T00:00:00", "2026-03-30T00:00:00", 3],
    ["2026-10-24T00:00:00", "2026-10-26T00:00:00", 3],
  ])("holidayDays %s..%s = %i", (from, to, days) => {
    expect(holidays.holidayDays({ date_from: from, date_to: to })).toBe(days);
  });
});

describe("nco comments", () => {
  const c = (over: Partial<comments.NcoComment>): comments.NcoComment =>
    ({ id: 1, cadet_cin: null, cadet_name: "", cadet_flight: null, ...over }) as comments.NcoComment;

  it("todayISO is the local date", () => {
    vi.useFakeTimers();
    // 23:30 UTC on 30 June is already 1 July in London (BST).
    vi.setSystemTime(new Date("2026-06-30T23:30:00Z"));
    expect(comments.todayISO()).toBe("2026-07-01");
    vi.useRealTimers();
  });

  it("knows a general comment from a cadet one, including a cadet who left", () => {
    expect(comments.isAboutCadet(c({}))).toBe(false);
    expect(comments.isAboutCadet(c({ cadet_cin: 1 }))).toBe(true);
    expect(comments.isAboutCadet(c({ cadet_name: "Cpl Gone" }))).toBe(true);
  });

  it("groups by cadet, by CIN where there is one and by name once they've left", () => {
    const groups = comments.groupByCadet([
      c({ id: 1, cadet_cin: 5, cadet_name: "Cpl A", cadet_flight: "A" }),
      c({ id: 2 }),
      c({ id: 3, cadet_name: "Cpl Gone" }),
      c({ id: 4, cadet_cin: 5, cadet_name: "Sgt A" }),
      c({ id: 5, cadet_name: "Cpl Gone" }),
    ]);
    expect(groups.map((g) => [g.key, g.comments.map((x) => x.id)])).toEqual([
      ["cin:5", [1, 4]],
      ["name:Cpl Gone", [3, 5]],
    ]);
    expect(groups[0]).toMatchObject({ name: "Cpl A", flight: "A", cin: 5 });
  });
});

describe("nco appraisals", () => {
  it("nextReviewDate clamps to the end of a shorter month, like the API", () => {
    const d = (s: string, m: number) => appraisals.nextReviewDate(s, m)?.toDateString();
    expect(d("2026-01-31", 1)).toBe(new Date(2026, 1, 28).toDateString());
    expect(d("2028-01-31", 1)).toBe(new Date(2028, 1, 29).toDateString());
    expect(d("2026-08-31", 6)).toBe(new Date(2027, 1, 28).toDateString());
    expect(d("2026-03-15", 12)).toBe(new Date(2027, 2, 15).toDateString());
    expect(appraisals.nextReviewDate("", 12)).toBeNull();
    expect(appraisals.nextReviewDate("garbage", 12)).toBeNull();
  });

  it("emptyDraft starts on today with a 12-month review", () => {
    const draft = appraisals.emptyDraft();
    expect(draft.next_review_months).toBe(12);
    expect(draft.appraisal_date).toBe(appraisals.todayInput());
    expect(draft.cadet_id).toBeNull();
  });

  it("draftFrom snaps an unknown interval back to 12 and trims the date", () => {
    const saved = {
      ...appraisals.emptyDraft(),
      id: 1,
      cadet_id: 4,
      appraisal_date: "2026-02-03T00:00:00",
      next_review_months: 9,
    } as unknown as appraisals.Appraisal;
    const draft = appraisals.draftFrom(saved);
    expect(draft.appraisal_date).toBe("2026-02-03");
    expect(draft.next_review_months).toBe(12);
    expect(appraisals.draftFrom({ ...saved, next_review_months: 3 }).next_review_months).toBe(3);
  });
});

describe("session plans", () => {
  it("lists the blank required fields, ignoring whitespace", () => {
    expect(missingForSubmit(EMPTY_PLAN)).toEqual([
      "Session name",
      "Aim/goal",
      "Situation",
      "Mission",
      "Execution",
    ]);
    expect(
      missingForSubmit({
        ...EMPTY_PLAN,
        session_name: "Nav",
        aim: "  ",
        situation: "s",
        mission: "m",
        execution: "e",
      })
    ).toEqual(["Aim/goal"]);
  });

  it("contentOf strips a detail back to the editable form", () => {
    const detail = {
      ...EMPTY_PLAN,
      id: 1,
      session_name: "Nav",
      session_date: "2026-05-06T00:00:00",
      timetable: null,
      status: "draft",
      comments: [],
    } as unknown as SessionPlanDetail;
    const content = contentOf(detail);
    expect(content.session_date).toBe("2026-05-06");
    expect(content.timetable).toEqual([]);
    expect(Object.keys(content).sort()).toEqual(Object.keys(EMPTY_PLAN).sort());
    expect(contentOf({ ...detail, session_date: null }).session_date).toBe("");
  });
});

describe("committee helpers", () => {
  it("formats money and dates", () => {
    expect(formatGBP(1234.5)).toBe("£1,234.50");
    expect(formatGBP(0)).toBe("£0.00");
    expect(formatDate(null)).toBe("—");
    expect(formatDate("2026-01-05")).toBe("5 Jan 2026");
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("2026-01-05T09:05:00")).toBe("5 Jan 2026, 09:05");
  });

  it("has a label and style for every status the API can return", () => {
    for (const status of [
      "submitted",
      "sent_to_committee",
      "approved",
      "rejected",
      "sent_for_payment",
      "paid",
      "withdrawn",
    ] as const) {
      expect(STATUS_LABELS[status]).toBeTruthy();
      expect(STATUS_STYLE[status].variant).toBeTruthy();
    }
  });
});
