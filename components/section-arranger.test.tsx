// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SectionArranger } from "@/components/section-arranger";

const ITEMS = [
  { id: "a", title: "Alpha" },
  { id: "b", title: "Bravo" },
  { id: "c", title: "Charlie" },
];

describe("SectionArranger", () => {
  it("lists the sections in order under the given name", () => {
    render(<SectionArranger items={ITEMS} onChange={vi.fn()} label="Page sections" />);
    const list = screen.getByRole("list", { name: "Page sections" });
    expect([...list.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
  });

  it("the arrows hand back the whole new order", () => {
    const onChange = vi.fn();
    render(<SectionArranger items={ITEMS} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Move Charlie up" }));
    expect(onChange).toHaveBeenLastCalledWith(["a", "c", "b"]);
    fireEvent.click(screen.getByRole("button", { name: "Move Alpha down" }));
    expect(onChange).toHaveBeenLastCalledWith(["b", "a", "c"]);
  });

  it("can't move the first up or the last down", () => {
    const onChange = vi.fn();
    render(<SectionArranger items={ITEMS} onChange={onChange} />);
    const up = screen.getByRole("button", { name: "Move Alpha up" }) as HTMLButtonElement;
    const down = screen.getByRole("button", { name: "Move Charlie down" }) as HTMLButtonElement;
    expect(up.disabled && down.disabled).toBe(true);
    fireEvent.click(up);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("gives every section a named drag handle", () => {
    render(<SectionArranger items={ITEMS} onChange={vi.fn()} />);
    for (const { title } of ITEMS) expect(screen.getByRole("button", { name: `Drag ${title}` })).toBeTruthy();
  });
});
