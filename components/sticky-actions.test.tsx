// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StickyActions } from "@/components/sticky-actions";

describe("StickyActions", () => {
  it("pins the form's buttons above the phone tab bar and to the window edge on a laptop", () => {
    render(
      <StickyActions>
        <button type="button">Submit Assessment</button>
      </StickyActions>
    );
    const row = screen.getByRole("button", { name: "Submit Assessment" }).parentElement!;
    expect(row).toHaveClass("sticky", "md:bottom-0", "no-print");
    // Clears the 3.5rem phone bar and the home indicator, so the bar never covers Submit.
    expect(row.className).toContain("bottom-[calc(3.5rem+env(safe-area-inset-bottom))]");
  });
});
