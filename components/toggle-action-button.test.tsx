// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackageCheck } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { ToggleActionButton } from "@/components/toggle-action-button";

function renderButton(props: Partial<React.ComponentProps<typeof ToggleActionButton>> = {}) {
  const onDo = vi.fn();
  const onUndo = vi.fn();
  render(
    <ToggleActionButton
      done={false}
      label="Mark as Given"
      doneLabel="Undo given"
      icon={PackageCheck}
      onDo={onDo}
      onUndo={onUndo}
      {...props}
    />
  );
  return { onDo, onUndo };
}

describe("ToggleActionButton", () => {
  it("does the action until it's done", async () => {
    const { onDo, onUndo } = renderButton();
    const button = screen.getByRole("button", { name: "Mark as Given" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);
    expect(onDo).toHaveBeenCalledOnce();
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("once done, the same button says it will undo, looks pressed, and undoes", async () => {
    const { onDo, onUndo } = renderButton({ done: true });
    const button = screen.getByRole("button", { name: "Undo given" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button.className).toContain("border-dashed");
    await userEvent.click(button);
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onDo).not.toHaveBeenCalled();
  });

  // "No size yet" stops a give, but must never trap a give already made.
  it("a blocked action still offers its undo once done", () => {
    renderButton({ done: true, disabled: true });
    expect(screen.getByRole("button", { name: "Undo given" })).toBeEnabled();
  });

  it("names the undo after the item it takes back", () => {
    renderButton({ done: true, itemLabel: "Beret" });
    expect(screen.getByRole("button", { name: "Undo given: Beret" })).toBeInTheDocument();
  });

  it("is disabled while busy, either way round", () => {
    renderButton({ busy: true });
    expect(screen.getByRole("button", { name: "Mark as Given" })).toBeDisabled();
  });

  it("an undo can be refused on its own", () => {
    renderButton({ done: true, undoDisabled: true });
    expect(screen.getByRole("button", { name: "Undo given" })).toBeDisabled();
  });
});
