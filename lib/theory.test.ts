import { describe, expect, it, vi } from "vitest";

import {
  categoriesOf,
  lessonLabel,
  lessonUrl,
  markLessons,
  progressLabel,
  progressOf,
  qrFileName,
  stillToDo,
  type CadetProgress,
  type TheorySubject,
} from "@/lib/theory";

const NAV: TheorySubject = { key: "nav", name: "Basic Navigation", category: "Leading", parts: 3 };
const POF: TheorySubject = { key: "pof", name: "Principles of Flight", category: "Leading", parts: 3 };
const RADIO: TheorySubject = { key: "radio", name: "Blue Radio", category: "Badges", parts: 1 };
const JEP: TheorySubject = { key: "jep", name: "Jet Engine Propulsion", category: "Senior/Master", parts: 3 };

function cadet(classification: string | null, subjects: CadetProgress["subjects"] = {}): CadetProgress {
  return { cin: 1, first_name: "Sam", last_name: "Do", rank: null, flight: "A", classification, subjects };
}

describe("categoriesOf", () => {
  it("puts the classification subjects before badge theory, otherwise keeping the API's order", () => {
    expect(categoriesOf([RADIO, NAV, JEP, POF])).toEqual(["Leading", "Senior/Master", "Badges"]);
    expect(categoriesOf([])).toEqual([]);
  });
});

describe("progressOf", () => {
  it("treats a subject the API left out as not started", () => {
    expect(progressOf(cadet(null), "nav")).toEqual({ lessons: [], taught: false, passed: false });
  });
});

describe("stillToDo", () => {
  it("a First Class cadet has the Leading subjects to do until they've passed them all", () => {
    expect(stillToDo(cadet("First Class Cadet"), [NAV, POF])).toBe(true);
    const done = { lessons: [], taught: false, passed: true };
    expect(stillToDo(cadet("First Class Cadet", { nav: done, pof: done }), [NAV, POF])).toBe(false);
  });

  it("a cadet below the category isn't on it, unless they've made a start anyway", () => {
    expect(stillToDo(cadet(null), [NAV, POF])).toBe(false);
    expect(stillToDo(cadet("First Class Cadet"), [JEP])).toBe(false);
    const started = { nav: { lessons: [1], taught: false, passed: false } };
    expect(stillToDo(cadet(null, started), [NAV, POF])).toBe(true);
  });

  it("badge theory is open to every cadet", () => {
    expect(stillToDo(cadet(null), [RADIO])).toBe(true);
  });

  it("an unknown classification is treated as the bottom of the ladder", () => {
    expect(stillToDo(cadet("Something new"), [NAV])).toBe(false);
  });
});

describe("labels", () => {
  it("says where a cadet is in a subject", () => {
    expect(progressLabel({ lessons: [], taught: false, passed: false }, 3)).toBe("Not started");
    expect(progressLabel({ lessons: [1, 3], taught: false, passed: false }, 3)).toBe("Lessons 1, 3 of 3");
    expect(progressLabel({ lessons: [1, 2, 3], taught: true, passed: false }, 3)).toBe("Taught, exam to sit");
    expect(progressLabel({ lessons: [1, 2, 3], taught: true, passed: true }, 3)).toBe("Passed");
    expect(progressLabel({ lessons: [1], taught: true, passed: false }, 1)).toBe("Taught, exam to sit");
  });

  it("names lessons, and calls badge theory's single session just Theory", () => {
    expect(lessonLabel(NAV, 2)).toBe("Lesson 2");
    expect(lessonLabel(RADIO, 1)).toBe("Theory");
  });

  it("makes a tidy file name for a downloaded code", () => {
    expect(qrFileName({ name: "Basic Navigation using Map & Compass", parts: 3 }, 2)).toBe(
      "basic-navigation-using-map-compass-lesson-2.png"
    );
    expect(qrFileName(RADIO, 1)).toBe("blue-radio-theory.png");
  });
});

describe("lessonUrl", () => {
  it("points at the portal's lesson page, whatever the trailing slashes", () => {
    expect(lessonUrl("abc123", "https://portal.example.com/")).toBe(
      "https://portal.example.com/lesson/abc123"
    );
    expect(lessonUrl("a-b_c", "https://portal.example.com")).toBe("https://portal.example.com/lesson/a-b_c");
  });

  it("escapes anything odd in a code", () => {
    expect(lessonUrl("a/b?c", "https://p.example")).toBe("https://p.example/lesson/a%2Fb%3Fc");
  });

  it("is null when the portal's address isn't configured, rather than a code that goes nowhere", () => {
    expect(lessonUrl("abc", "")).toBeNull();
  });
});

describe("markLessons", () => {
  it("posts the cadets and lessons, and rejects with the API's own message", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ detail: "Basic Navigation only has 3 lesson(s)." }, { status: 400 })
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(markLessons("tok", [1, 2], [{ key: "nav", part: 4 }])).rejects.toThrow("only has 3");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/cadets\/theory\/mark$/);
    expect(JSON.parse(String(init.body))).toEqual({
      cadet_cins: [1, 2],
      lessons: [{ key: "nav", part: 4 }],
      completed: true,
    });
  });

  it("flattens a FastAPI validation list instead of showing [object Object]", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({ detail: [{ msg: "Input should be greater than or equal to 1" }] }, { status: 422 })
    );
    await expect(markLessons("tok", [1], [{ key: "nav", part: 0 }], false)).rejects.toThrow(
      "Input should be greater than or equal to 1"
    );
  });

  it("an API that can't be reached says so", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    await expect(markLessons("tok", [1], [{ key: "nav" }])).rejects.toThrow("Server unreachable.");
  });
});
