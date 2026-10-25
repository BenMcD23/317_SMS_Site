import { describe, expect, it } from "vitest";

import { type Stage, deadlineText, deadlineTone, nextStepLabel, stagesFor } from "@/lib/applications";

const stage = (key: string, routes: Stage["routes"] = []): Stage => ({
  key,
  title: key,
  routes,
  note: null,
  steps: [{ key: `${key}-1`, label: `${key} first`, hint: null, links: [] }],
});
const STAGES = [stage("application"), stage("wing"), stage("region", ["cfc"]), stage("appointment")];

describe("stagesFor", () => {
  it("leaves the Region board out for an SNCO and in for an officer", () => {
    expect(stagesFor(STAGES, "snco").map((s) => s.key)).toEqual(["application", "wing", "appointment"]);
    expect(stagesFor(STAGES, "cfc")).toHaveLength(4);
  });

  it("gives a staff cadet (no route) only the stages for everyone", () => {
    expect(stagesFor(STAGES, null)).toHaveLength(3);
  });
});

describe("nextStepLabel", () => {
  it("finds the label of the next step in any stage", () => {
    expect(nextStepLabel(STAGES, "region-1")).toBe("region first");
  });

  it("is null when everything is done or the key is unknown", () => {
    expect(nextStepLabel(STAGES, null)).toBeNull();
    expect(nextStepLabel(STAGES, "gone")).toBeNull();
  });
});

describe("the 18th birthday deadline", () => {
  it.each([
    [null, null],
    [200, null],
    [91, null],
    [90, "warning"],
    [0, "warning"],
    [-1, "destructive"],
  ] as const)("%s days to go is %s", (days, tone) => {
    expect(deadlineTone(days)).toBe(tone);
  });

  it.each([
    [null, "No date of birth on SMS"],
    [0, "Turns 18 today"],
    [1, "Turns 18 in 1 day"],
    [10, "Turns 18 in 10 days"],
    [35, "Turns 18 in 5 weeks"],
    [150, "Turns 18 in 5 months"],
    [-21, "Turned 18 3 weeks ago"],
  ] as const)("%s days reads %s", (days, text) => {
    expect(deadlineText(days)).toBe(text);
  });
});
