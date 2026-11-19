// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FieldcraftCard } from "@/components/fieldcraft-card";
import type { CadetFieldcraftLevel } from "@/lib/fieldcraft";

const lesson = (id: number, title: string, done: boolean, completed_on: string | null = null) => ({
  lesson_id: id,
  level: "Blue",
  reference: `Lesson ${id}`,
  title,
  done,
  completed_on,
  delivered_by: done ? "FS Ó Briain" : null,
});

const LEVELS: CadetFieldcraftLevel[] = [
  { level: "Blue", lessons: [lesson(1, "Introduction", true, "2026-05-16"), lesson(2, "Packing", true)] },
  { level: "Bronze", lessons: [lesson(12, "Moving", false)] },
];

describe("FieldcraftCard", () => {
  it("shows each level's lessons, what's done, when and by whom", () => {
    render(<FieldcraftCard levels={LEVELS} />);
    const blue = screen.getByRole("region", { name: "Blue fieldcraft" });
    expect(blue.textContent).toContain("all lessons done");
    expect(blue.textContent).toContain("16 May 2026");
    expect(blue.textContent).toContain("no date"); // done, but the portal has no date
    expect(blue.textContent).toContain("FS Ó Briain");
    const bronze = screen.getByRole("region", { name: "Bronze fieldcraft" });
    expect(bronze.textContent).toContain("0 of 1 lessons");
    expect(within(bronze).getByLabelText("Not done")).toBeTruthy();
  });

  it("says when the sync has no record for the cadet", () => {
    render(<FieldcraftCard levels={null} />);
    expect(screen.getByText(/No fieldcraft record from the Volunteer Portal yet/)).toBeTruthy();
  });

  it("says when the portal has no lessons recorded", () => {
    render(<FieldcraftCard levels={[]} />);
    expect(screen.getByText(/No fieldcraft lessons recorded/)).toBeTruthy();
  });
});
