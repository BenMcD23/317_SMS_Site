// @vitest-environment jsdom
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CadetMultiPicker, type PickableCadet } from "@/components/cadet-multi-picker";

const ROSTER: PickableCadet[] = [
  { cin: 1, first_name: "Amy", last_name: "Able", flight: "A" },
  { cin: 2, first_name: "Ben", last_name: "Baker", flight: "B" },
  { cin: 3, first_name: "Cal", last_name: "Cole", flight: "B" },
  { cin: 4, first_name: "Dee", last_name: "Dale", flight: null },
];

/** The picker is controlled; this holds its selection like the pages do. */
function Harness({
  cadets = ROSTER,
  onChange,
}: {
  cadets?: PickableCadet[];
  onChange?: (s: Set<number>) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  return (
    <CadetMultiPicker
      cadets={cadets}
      loading={false}
      selected={selected}
      onChange={(next) => {
        setSelected(next);
        onChange?.(next);
      }}
    />
  );
}

describe("CadetMultiPicker", () => {
  it("selects a whole flight in two taps", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "B Flight" }));
    await userEvent.click(screen.getByRole("button", { name: "Select all of B Flight" }));
    expect([...onChange.mock.lastCall![0]].sort()).toEqual([2, 3]);
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("keeps earlier picks when another flight is added", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /Able, Amy/ }));
    await userEvent.click(screen.getByRole("radio", { name: "B Flight" }));
    await userEvent.click(screen.getByRole("button", { name: "Select all of B Flight" }));
    expect([...onChange.mock.lastCall![0]].sort()).toEqual([1, 2, 3]);
  });

  it("toggles a cadet from the name as well as the box", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByText("Baker, Ben"));
    expect(screen.getByRole("checkbox", { name: /Baker, Ben/ })).toBeChecked();
    await userEvent.click(screen.getByText("Baker, Ben"));
    expect(screen.getByRole("checkbox", { name: /Baker, Ben/ })).not.toBeChecked();
  });

  it("only selects what the search shows", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Search cadets" }), "cole");
    await userEvent.click(screen.getByRole("button", { name: "Select all shown" }));
    expect([...onChange.mock.lastCall![0]]).toEqual([3]);
  });

  it("says so when nothing matches, and offers nothing to select", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByRole("textbox", { name: "Search cadets" }), "zzz");
    expect(screen.getByText("No cadets match.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select all shown" })).toBeDisabled();
  });

  it("copes with an empty roster", () => {
    render(<Harness cadets={[]} />);
    expect(screen.getByText("No cadets on the roster.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filter by flight" })).not.toBeInTheDocument();
  });

  it("clears the selection", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText("4 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getByText("0 selected")).toBeInTheDocument();
  });
});
