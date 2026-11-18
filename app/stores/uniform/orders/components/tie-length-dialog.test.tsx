// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TieLengthDialog } from "@/app/stores/uniform/orders/components/tie-length-dialog";

describe("TieLengthDialog", () => {
  it.each(["Short", "Standard"] as const)("choosing %s demands that length and closes", async (length) => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    const onClose = vi.fn();
    render(<TieLengthDialog open onChoose={onChoose} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: length }));

    expect(onChoose).toHaveBeenCalledExactlyOnceWith(length);
    expect(onClose).toHaveBeenCalled();
  });

  it("dismissing it adds nothing to the logs form", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    const onClose = vi.fn();
    render(<TieLengthDialog open onChoose={onChoose} onClose={onClose} />);

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
    expect(onChoose).not.toHaveBeenCalled();
  });
});
