// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/reference", () => ({
  useReference: () => ({ sizes: { Beret: ["54", "55", "56"], Tie: ["Short", "Standard"] } }),
}));

import { SizeCombobox } from "@/components/size-combobox";

function Controlled({ itemType = "Beret", disabled = false }: { itemType?: string; disabled?: boolean }) {
  const [value, setValue] = useState("");
  return (
    <>
      <SizeCombobox itemType={itemType} value={value} onChange={setValue} disabled={disabled} />
      <output>{value}</output>
    </>
  );
}

describe("SizeCombobox", () => {
  it("suggests the catalogue sizes for the item and filters as you type", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(screen.getByPlaceholderText("Size"));
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["54", "55", "56"]);
    await user.type(screen.getByPlaceholderText("Size"), "5");
    await user.type(screen.getByPlaceholderText("Size"), "6");
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["56"]);
  });

  it("picking a suggestion sets the value and closes the list", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(screen.getByPlaceholderText("Size"));
    await user.click(screen.getByRole("button", { name: "55" }));
    expect(screen.getByRole("status")).toHaveTextContent("55");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("free text is allowed for sizes the catalogue doesn't list", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.type(screen.getByPlaceholderText("Size"), "XXL");
    expect(screen.getByRole("status")).toHaveTextContent("XXL");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("Escape closes the list; unknown items and disabled inputs never open it", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Controlled />);
    await user.click(screen.getByPlaceholderText("Size"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button")).toBeNull();
    unmount();

    render(<Controlled itemType="Lanyard" />);
    await user.click(screen.getByPlaceholderText("Size"));
    expect(screen.queryByRole("button")).toBeNull();
  });
});
