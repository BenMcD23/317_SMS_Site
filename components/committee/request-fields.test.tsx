// @vitest-environment jsdom
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CommitteeRequestFields } from "@/components/committee/request-fields";
import { type CommitteeRequestForm, committeeRequestSchema, emptyRequest } from "@/lib/committee-form";

function Harness({ onSubmit }: { onSubmit: (v: CommitteeRequestForm) => void }) {
  const form = useForm<CommitteeRequestForm>({
    resolver: zodResolver(committeeRequestSchema),
    defaultValues: emptyRequest(),
    mode: "onTouched",
  });
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <CommitteeRequestFields form={form} idPrefix="t" />
      <button type="submit">Send</button>
    </form>
  );
}

const type = (name: string | RegExp, value: string, nth = 0) =>
  fireEvent.change(screen.getAllByLabelText(name)[nth], { target: { value } });
const totalOf = (nth = 0) => (screen.getAllByLabelText("Total")[nth] as HTMLInputElement).value;

describe("CommitteeRequestFields", () => {
  it("fills an item's total from quantity × unit cost", () => {
    render(<Harness onSubmit={vi.fn()} />);
    type("Qty", "3");
    type("Unit cost", "24.99");
    expect(totalOf()).toBe("74.97");
    expect(screen.getByText("£74.97")).toBeTruthy();
  });

  it("keeps a total typed over the filled one, until quantity or unit cost changes again", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    type("Title", "Batteries");
    type("Item 1", "AA batteries");
    type("Qty", "4");
    type("Unit cost", "2.50");
    type("Total", "8");
    expect(totalOf()).toBe("8");

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].items).toEqual([
      { description: "AA batteries", quantity: 4, unitCost: 2.5, total: 8 },
    ]);

    type("Qty", "5");
    expect(totalOf()).toBe("12.5");
  });

  it("adds and removes items, but never the last one, and totals across them", () => {
    render(<Harness onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Remove item 1" })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    type("Unit cost", "10", 0);
    type("Qty", "2", 1);
    type("Unit cost", "5", 1);
    expect(screen.getByText("£20.00")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove item 1" }));
    expect(screen.getAllByLabelText("Total")).toHaveLength(1);
    expect(totalOf()).toBe("10");
    expect(screen.getByRole("button", { name: "Remove item 1" })).toHaveProperty("disabled", true);
  });

  it("an empty request is not sent, and says what each field needs", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Give the request a title")).toBeTruthy();
    expect(screen.getByText("Say what the item is")).toBeTruthy();
    expect(screen.getAllByText("Enter an amount")).toHaveLength(2);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
