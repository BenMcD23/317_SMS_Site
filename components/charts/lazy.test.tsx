// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TrendBarChart } from "@/components/charts/lazy";

const rows = [
  { label: "Sep", rate: 80 },
  { label: "Oct", rate: 90 },
];

describe("TrendBarChart (lazy)", () => {
  it("holds the chart's height while Recharts loads, so the page doesn't jump", () => {
    const { container } = render(
      <TrendBarChart data={rows} dataKey="rate" name="Turnout" height={220} describe={(r) => `${r.rate}%`} />
    );
    const box = container.firstElementChild as HTMLElement;
    expect(box.style.height).toBe("220px");
    // The placeholder is decoration: a screen reader hears nothing until the chart is there.
    expect(box.querySelector('[data-slot="skeleton"]')).toHaveAttribute("aria-hidden");
  });

  it("draws the chart once its code has loaded", async () => {
    const { container } = render(
      <TrendBarChart data={rows} dataKey="rate" name="Turnout" height={180} describe={(r) => `${r.rate}%`} />
    );
    // ResponsiveContainer is Recharts' outer element; it replaces the skeleton.
    await screen.findByText((_, el) => !!el?.classList.contains("recharts-responsive-container"));
    expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();
  });
});
