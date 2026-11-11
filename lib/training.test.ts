// The training helpers: lesson values in selects, the session form's rules and
// what it sends, how a link reads in a list, and the night copied as text.
import { describe, expect, it } from "vitest";

import {
  lessonName,
  lessonValue,
  linkSummary,
  nightToText,
  parseLesson,
  periodLabel,
  sessionFormFrom,
  sessionPayload,
  sessionSchema,
  type NightSession,
  type SessionForm,
  type TrainingNight,
} from "@/lib/training";

const SUBJECTS = [
  { key: "acp_32_2", name: "Basic Navigation", category: "Leading", parts: 3 },
  { key: "blue_radio", name: "Blue Radio", category: "Badges", parts: 1 },
];

const form = (over: Partial<SessionForm> = {}): SessionForm => ({
  ...sessionFormFrom(null),
  title: "Drill",
  ...over,
});

describe("lesson values", () => {
  it("round-trip a subject and lesson number through one select value", () => {
    expect(lessonValue("acp_32_2", 2)).toBe("acp_32_2:2");
    expect(parseLesson("acp_32_2:2")).toEqual({ subject_key: "acp_32_2", part: 2 });
  });

  it.each(["", "acp_32_2", ":2", "acp_32_2:x", "acp_32_2:0"])("reads %j as no lesson", (value) => {
    expect(parseLesson(value)).toEqual({ subject_key: null, part: null });
  });

  it("is empty without both halves", () => {
    expect(lessonValue(null, 2)).toBe("");
    expect(lessonValue("acp_32_2", null)).toBe("");
  });

  it("names a lesson with its number only when the subject has more than one", () => {
    expect(lessonName("Basic Navigation", 2, 3)).toBe("Basic Navigation, lesson 2");
    expect(lessonName("Blue Radio", 1, 1)).toBe("Blue Radio");
  });
});

describe("the session form", () => {
  it("accepts a plain session with just a name", () => {
    expect(sessionSchema.safeParse(form()).success).toBe(true);
  });

  it.each([
    [{ title: "  " }, "title", "Give it a name"],
    [{ needOnly: true }, "needOnly", "Pick a lesson first"],
    [{ grouping: "need" as const }, "grouping", "Pick a lesson to group by need"],
    [{ maxGroup: "1" }, "maxGroup", "A whole number from 2 to 60"],
    [{ maxGroup: "ten" }, "maxGroup", "A whole number from 2 to 60"],
    [{ groupCount: "21" }, "groupCount", "A whole number from 1 to 20"],
  ])("refuses %j with a message that says what to do", (over, path, message) => {
    const res = sessionSchema.safeParse(form(over));
    expect(res.success).toBe(false);
    expect(res.error?.issues.find((i) => i.path[0] === path)?.message).toBe(message);
  });

  it("allows grouping by need and need-only once a lesson is picked", () => {
    expect(
      sessionSchema.safeParse(form({ lesson: "acp_32_2:2", needOnly: true, grouping: "need" })).success
    ).toBe(true);
  });

  it("sends blanks as nothing, and the group count only for mixed groups", () => {
    expect(sessionPayload(form({ title: " Drill ", groupCount: "3", instructor: "  " }))).toEqual({
      title: "Drill",
      period: null,
      subject_key: null,
      part: null,
      flights: [],
      pool: "auto",
      include: "all",
      grouping: "one",
      group_count: null,
      max_group: null,
      instructor: null,
      notes: null,
    });
    expect(
      sessionPayload(
        form({
          period: "2",
          lesson: "acp_32_2:2",
          needOnly: true,
          grouping: "mixed",
          groupCount: "3",
          maxGroup: "8",
          flights: ["A"],
        })
      )
    ).toMatchObject({
      period: 2,
      subject_key: "acp_32_2",
      part: 2,
      include: "need",
      group_count: 3,
      max_group: 8,
    });
  });

  it("never sends need-only without a lesson, even if the switch was left on", () => {
    expect(sessionPayload(form({ needOnly: true })).include).toBe("all");
  });

  it("starts from a saved session's inputs", () => {
    const saved = {
      title: "Map Reading 2",
      period: 1,
      subject_key: "acp_32_2",
      part: 2,
      flights: ["A"],
      pool: "checked_in",
      include: "need",
      grouping: "mixed",
      group_count: 3,
      max_group: null,
      instructor: null,
      notes: null,
    } as unknown as NightSession;
    expect(sessionFormFrom(saved)).toMatchObject({
      period: "1",
      lesson: "acp_32_2:2",
      needOnly: true,
      groupCount: "3",
      maxGroup: "",
      instructor: "",
    });
  });
});

describe("period labels", () => {
  it.each([
    [1, "1st half (19:25–20:05)"],
    [2, "2nd half (20:20–21:00)"],
    [null, "Whole night"],
  ])("names %j %j", (period, label) => {
    expect(periodLabel(period)).toBe(label);
  });
});

describe("link summaries", () => {
  const base = { subject_name: null, new_subject: null, part: null, source: null, subject_key: null };

  it.each([
    [{ ...base, state: "none" as const }, "No link"],
    [{ ...base, state: "not_lesson" as const }, "Not a lesson"],
    [
      {
        ...base,
        state: "linked" as const,
        subject_key: "acp_32_2",
        subject_name: "Basic Navigation",
        part: 2,
      },
      "Basic Navigation, lesson 2",
    ],
    [{ ...base, state: "linked" as const, subject_key: "blue_radio", part: 1 }, "Blue Radio"],
    [
      { ...base, state: "suggested" as const, new_subject: "Flying Ops", part: 1 },
      "New subject: Flying Ops, lesson 1",
    ],
    [
      { ...base, state: "linked" as const, subject_key: "retired_thing", part: 1, broken: true },
      "A subject no longer in use, lesson 1",
    ],
  ])("%j reads as %j", (link, text) => {
    expect(linkSummary(link, SUBJECTS)).toBe(text);
  });
});

describe("the night as text", () => {
  it("lists each session's groups, with ranks, ready to paste", () => {
    const night = {
      date: "2026-11-02",
      checked_in: 2,
      flights: ["A"],
      programme: [],
      sessions: [
        {
          title: "Map Reading 2",
          period: 1,
          part: 2,
          instructor: "Sgt Davies",
          lesson: { key: "acp_32_2", name: "Basic Navigation", parts: 3, code: "X" },
          groups: [
            {
              label: "Needs this lesson",
              cadets: [
                { cin: 1, first_name: "Amy", last_name: "Able", rank: "Cpl" },
                { cin: 2, first_name: "Zoë", last_name: "Ørsted", rank: null },
              ],
            },
          ],
        },
        { title: "Drill", period: null, part: null, instructor: null, lesson: null, groups: [] },
      ],
    } as unknown as TrainingNight;
    expect(nightToText(night)).toBe(
      "1st half (19:25–20:05): Map Reading 2 (Basic Navigation, lesson 2) - Sgt Davies\n" +
        "  Needs this lesson: Cpl Amy Able, Zoë Ørsted\n\n" +
        "Whole night: Drill"
    );
  });
});
