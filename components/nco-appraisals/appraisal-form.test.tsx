// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppraisalForm } from "@/components/nco-appraisals/appraisal-form";
import { emptyDraft } from "@/lib/nco-appraisals";

describe("AppraisalForm layout", () => {
  // jsdom has no layout engine, so this pins the classes that stop a long
  // value (a name with " — never appraised") stretching a one-column grid
  // wider than a phone: bare `grid` sizes its column to the content, while
  // `grid-cols-1` is minmax(0, 1fr) and lets inputs shrink to fit.
  it("keeps every card grid at a shrinkable single column on a phone", () => {
    const { container } = render(
      <AppraisalForm
        draft={{
          ...emptyDraft(),
          nco_name: "Flight Sergeant Neve Mullery-McCourt",
          attendance: "31 nights, last 12 weeks",
        }}
        setDraft={() => {}}
        ncos={[]}
        token={undefined}
        lockedNco
      />
    );
    const grids = Array.from(container.querySelectorAll<HTMLElement>("[data-slot='card-content'].grid"));
    expect(grids.length).toBeGreaterThanOrEqual(2);
    for (const grid of grids) expect(grid.className).toContain("grid-cols-1");
  });
});
