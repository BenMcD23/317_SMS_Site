// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { useConfirm } from "@/components/confirm-dialog";

function Harness({ onDelete }: { onDelete: () => void }) {
  const { confirm, confirmDialog } = useConfirm();
  return (
    <div>
      <button onClick={() => confirm("Delete order 12?", onDelete)}>Delete</button>
      {confirmDialog}
    </div>
  );
}

describe("useConfirm", () => {
  it("asks first and only acts on Confirm", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(<Harness onDelete={onDelete} />);

    expect(screen.queryByText("Delete order 12?")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Delete order 12?");
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Cancel and Escape close without acting", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(<Harness onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("runs the action from the latest request, not an earlier one", async () => {
    const first = vi.fn();
    const second = vi.fn();
    function Two() {
      const { confirm, confirmDialog } = useConfirm();
      return (
        <div>
          <button onClick={() => confirm("First?", first)}>A</button>
          <button onClick={() => confirm("Second?", second)}>B</button>
          {confirmDialog}
        </div>
      );
    }
    const user = userEvent.setup();
    render(<Two />);
    await user.click(screen.getByRole("button", { name: "A" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "B" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Second?");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });
});
