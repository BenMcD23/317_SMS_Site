// @vitest-environment jsdom
// The comment box: @mentions picked by keyboard or mouse become the API's
// tokens, a deleted name mentions no one, "Assign to" follows the first
// mention, and a failed send keeps what was typed.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CommentComposer, type MentionPerson } from "@/components/programme-builder/comment-composer";

const PEOPLE: MentionPerson[] = [
  { key: "staff:3001", name: "Sgt Sarah Hughes", kind: "staff" },
  { key: "staff:3000", name: "CI Sam Staff", kind: "staff" },
  { key: "cadet:1", name: "Cpl Nina Ó Briain", kind: "nco" },
];

function setup(props: Partial<React.ComponentProps<typeof CommentComposer>> = {}) {
  const onSubmit = vi.fn(async () => true);
  render(<CommentComposer people={PEOPLE} label="Comment on the programme" onSubmit={onSubmit} {...props} />);
  return { onSubmit, box: screen.getByRole("combobox", { name: "Comment on the programme" }) };
}

describe("CommentComposer", () => {
  it("lists matching staff and NCOs after @ and sends the pick as a mention", async () => {
    const user = userEvent.setup();
    const { onSubmit, box } = setup();
    await user.type(box, "Can @sa");
    const list = screen.getByRole("listbox", { name: "People to mention" });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "SHSgt Sarah HughesStaff",
      "CSCI Sam StaffStaff",
    ]);
    expect(list).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(box).toHaveValue("Can @CI Sam Staff ");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.type(box, "take this?");
    await user.click(screen.getByRole("button", { name: "Comment" }));
    expect(onSubmit).toHaveBeenCalledWith("Can @[CI Sam Staff](staff:3000) take this?", false);
    expect(box).toHaveValue("");
  });

  it("picks with the mouse and matches non-ASCII names", async () => {
    const user = userEvent.setup();
    const { onSubmit, box } = setup();
    await user.type(box, "@ó");
    await user.click(screen.getByRole("option", { name: /Nina Ó Briain/ }));
    await user.type(box, "{Control>}{Enter}{/Control}");
    expect(onSubmit).toHaveBeenCalledWith("@[Cpl Nina Ó Briain](cadet:1)", false);
  });

  it("offers to assign the first person mentioned and sends it as an action item", async () => {
    const user = userEvent.setup();
    const { onSubmit, box } = setup({ allowAssign: true });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.type(box, "@sarah");
    await user.keyboard("{Enter}");
    await user.type(box, "please book the hall");
    await user.click(screen.getByRole("checkbox", { name: "Assign to Sgt Sarah Hughes" }));
    await user.click(screen.getByRole("button", { name: "Assign" }));
    expect(onSubmit).toHaveBeenCalledWith("@[Sgt Sarah Hughes](staff:3001) please book the hall", true);
  });

  it("mentions no one whose name was deleted after picking it", async () => {
    const user = userEvent.setup();
    const { onSubmit, box } = setup({ allowAssign: true });
    await user.type(box, "@sarah");
    await user.keyboard("{Enter}");
    await user.clear(box);
    await user.type(box, "Never mind");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Comment" }));
    expect(onSubmit).toHaveBeenCalledWith("Never mind", false);
  });

  it("keeps the text when the comment couldn't be sent", async () => {
    const user = userEvent.setup();
    const { box } = setup({ onSubmit: vi.fn(async () => false) });
    await user.type(box, "Is the hall free?");
    await user.click(screen.getByRole("button", { name: "Comment" }));
    expect(box).toHaveValue("Is the hall free?");
  });

  it("opens an existing comment as readable text, keeps its mentions, and Escape cancels", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { onSubmit, box } = setup({
      initial: "Ask @[Sgt Sarah Hughes](staff:3001) first",
      submitLabel: "Save",
      onCancel,
    });
    expect(box).toHaveValue("Ask @Sgt Sarah Hughes first");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledWith("Ask @[Sgt Sarah Hughes](staff:3001) first", false);
    await user.type(box, "{Escape}");
    expect(onCancel).toHaveBeenCalled();
  });

  it("won't send an empty comment", async () => {
    const { onSubmit } = setup();
    expect(screen.getByRole("button", { name: "Comment" })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
