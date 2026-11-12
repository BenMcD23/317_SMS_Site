// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SavedHeading } from "@/components/assessments/saved-heading";

describe("SavedHeading", () => {
  it("once recorded, says so and links to Results, so the sheet isn't a dead end", () => {
    render(
      <SavedHeading
        title="Assessment Saved"
        what="Ava Smith's radio assessment"
        queued={false}
        assessmentId={12}
      />
    );
    expect(screen.getByRole("heading", { name: "Assessment Saved" })).toBeInTheDocument();
    expect(screen.getByText("Ava Smith's radio assessment has been recorded.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See it in Results" })).toHaveAttribute(
      "href",
      "/cadets/assessments"
    );
  });

  it("waiting for signal, says it's on this phone and offers no link to something not there yet", () => {
    render(<SavedHeading title="Assessment Saved" what="Ava's sheet" queued assessmentId={null} />);
    expect(screen.getByRole("heading", { name: "Saved on this phone" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(/Assessment ID/)).not.toBeInTheDocument();
  });
});
