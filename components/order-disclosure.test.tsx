// @vitest-environment jsdom
import { useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OrderDisclosure } from "@/components/order-disclosure";

function Harness({ onAction = vi.fn(), initiallyOpen = false }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <OrderDisclosure
      open={open}
      onToggle={() => setOpen((o) => !o)}
      label="order for Amy Able"
      title={<Link href="/cadets/1">Amy Able</Link>}
      meta="15 Oct 2026"
      aside={
        <>
          <button onClick={onAction}>Sizes</button>
          {createPortal(<button onClick={onAction}>In a popover</button>, document.body)}
        </>
      }
    >
      <p>Beret, size 55</p>
    </OrderDisclosure>
  );
}

const toggle = () => screen.getByRole("button", { name: /order for Amy Able/ });

describe("OrderDisclosure", () => {
  it("starts closed and opens from its toggle, saying which state it's in", async () => {
    render(<Harness />);
    expect(screen.queryByText("Beret, size 55")).toBeNull();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle());
    expect(screen.getByText("Beret, size 55")).toBeInTheDocument();
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(toggle()).toHaveAccessibleName("Collapse order for Amy Able");
  });

  // On a phone the chevron is a small target at the far edge.
  it("opens and closes from anywhere on the header, not just the chevron", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByText("15 Oct 2026"));
    expect(screen.getByText("Beret, size 55")).toBeInTheDocument();
    await userEvent.click(screen.getByText("15 Oct 2026"));
    expect(screen.queryByText("Beret, size 55")).toBeNull();
  });

  it("leaves the header's own links and buttons to do their job", async () => {
    const onAction = vi.fn();
    render(<Harness onAction={onAction} />);
    await userEvent.click(screen.getByRole("button", { name: "Sizes" }));
    expect(onAction).toHaveBeenCalled();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  // A popover's content is portalled out of the header, but React still
  // bubbles its clicks through the header's handler.
  it("ignores clicks inside a popover opened from the header", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "In a popover" }));
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("points its toggle at the panel it controls", async () => {
    render(<Harness initiallyOpen />);
    const panel = document.getElementById(toggle().getAttribute("aria-controls")!);
    expect(panel).toContainElement(screen.getByText("Beret, size 55"));
  });
});
