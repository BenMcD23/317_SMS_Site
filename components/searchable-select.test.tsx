// @vitest-environment jsdom
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { SearchableSelect, type SearchableOption } from "@/components/searchable-select";

const OPTIONS: SearchableOption[] = [
  { value: "radio-bronze", label: "Radio – Bronze", group: "Radio" },
  { value: "radio-silver", label: "Radio – Silver", group: "Radio" },
  { value: "first-aid", label: "First Aid", group: "Other", keywords: ["medic"] },
  { value: "shooting", label: "Shooting", group: "Other", hint: "2 in stock", disabled: true },
];

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="badge">Badge</label>
      <SearchableSelect
        id="badge"
        value={value}
        onValueChange={setValue}
        options={OPTIONS}
        placeholder="Pick a badge"
      />
      <output aria-label="chosen">{value}</output>
    </>
  );
}

describe("SearchableSelect", () => {
  it("is a combobox named by its label, showing the placeholder until something's picked", () => {
    render(<Harness />);
    expect(screen.getByRole("combobox", { name: "Badge" })).toHaveTextContent("Pick a badge");
  });

  it("finds an option by typing part of its name, and picks it", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("combobox", { name: "Badge" }));
    await userEvent.type(screen.getByPlaceholderText("Search…"), "silv");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Radio – Silver"]);
    await userEvent.click(screen.getByRole("option", { name: "Radio – Silver" }));
    expect(screen.getByRole("status", { name: "chosen" })).toHaveTextContent("radio-silver");
    expect(screen.getByRole("combobox", { name: "Badge" })).toHaveTextContent("Radio – Silver");
  });

  it("matches the extra keywords, and says when nothing does", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("combobox", { name: "Badge" }));
    await userEvent.type(screen.getByPlaceholderText("Search…"), "medic");
    expect(screen.getByRole("option", { name: "First Aid" })).toBeInTheDocument();
    await userEvent.clear(screen.getByPlaceholderText("Search…"));
    await userEvent.type(screen.getByPlaceholderText("Search…"), "zzz");
    expect(screen.getByText("Nothing matches.")).toBeInTheDocument();
  });

  it("lists options under their group, and won't pick a disabled one", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("combobox", { name: "Badge" }));
    expect(screen.getByText("Radio")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: /Shooting/ }));
    expect(screen.getByRole("status", { name: "chosen" })).toHaveTextContent("");
  });

  it("shows the current value's label, and an unknown value as the placeholder", () => {
    render(<Harness initial="first-aid" />);
    expect(screen.getByRole("combobox", { name: "Badge" })).toHaveTextContent("First Aid");
  });
});
