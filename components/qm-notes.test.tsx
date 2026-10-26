// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { QmNotes } from "@/components/qm-notes";
import { ReadyStamp } from "@/components/ready-stamp";

const NOTE = { id: "n1", content: "Sized at parade", timestamp: "2026-10-06T19:00:00", addedBy: "Sgt Smith" };

describe("QmNotes", () => {
  it("adds a note and closes the editor once it's saved", async () => {
    const onAdd = vi.fn(async () => {});
    render(<QmNotes notes={[]} editable itemLabel="Beret" onAdd={onAdd} onDelete={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Add QM Note" }));
    await userEvent.type(screen.getByRole("textbox", { name: "QM note on Beret" }), "  Needs a 56  ");
    await userEvent.click(screen.getByRole("button", { name: "Save Note" }));
    expect(onAdd).toHaveBeenCalledWith("Needs a 56");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("won't save an empty note", async () => {
    render(<QmNotes notes={[]} editable itemLabel="Beret" onAdd={vi.fn()} onDelete={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Add QM Note" }));
    await userEvent.type(screen.getByRole("textbox"), "   ");
    expect(screen.getByRole("button", { name: "Save Note" })).toBeDisabled();
  });

  it("a failed save keeps what was typed", async () => {
    const onAdd = vi.fn(async () => {
      throw new Error("offline");
    });
    render(<QmNotes notes={[]} editable itemLabel="Beret" onAdd={onAdd} onDelete={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Add QM Note" }));
    await userEvent.type(screen.getByRole("textbox"), "Keep me");
    await userEvent.click(screen.getByRole("button", { name: "Save Note" }));
    expect(screen.getByRole("textbox")).toHaveValue("Keep me");
  });

  it("each note can be deleted by name, with a phone-sized target", async () => {
    const onDelete = vi.fn();
    render(<QmNotes notes={[NOTE]} editable itemLabel="Beret" onAdd={vi.fn()} onDelete={onDelete} />);
    expect(screen.getByText("Sized at parade")).toBeInTheDocument();
    const del = screen.getByRole("button", { name: "Delete note" });
    expect(del).toHaveClass("size-8");
    await userEvent.click(del);
    expect(onDelete).toHaveBeenCalledWith("n1");
  });

  it("a completed order shows its notes but nothing to change them", () => {
    render(<QmNotes notes={[NOTE]} editable={false} itemLabel="Beret" onAdd={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("Sized at parade")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders nothing when there's nothing to show or do", () => {
    const { container } = render(
      <QmNotes notes={undefined} editable={false} itemLabel="Beret" onAdd={vi.fn()} onDelete={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ReadyStamp", () => {
  it("shows when the cadet was told, until the item is given", () => {
    const { rerender, container } = render(
      <ReadyStamp readyToCollect="2026-10-06T19:00:00" givenAt={null} />
    );
    expect(screen.getByText(/Cadet notified/)).toBeInTheDocument();
    rerender(<ReadyStamp readyToCollect="2026-10-06T19:00:00" givenAt="2026-10-08T19:00:00" />);
    expect(container).toBeEmptyDOMElement();
  });
});
