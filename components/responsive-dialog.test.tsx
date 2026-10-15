// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";

function phone(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  );
}

function renderDialog() {
  render(
    <ResponsiveDialog open onOpenChange={vi.fn()}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Add stock</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <p>Body</p>
        <ResponsiveDialogFooter>
          <button>Save</button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

describe("ResponsiveDialog", () => {
  it("is a centred dialog on a laptop", () => {
    phone(false);
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Add stock" });
    expect(dialog).toHaveAttribute("data-slot", "dialog-content");
    expect(dialog.className).toContain("sm:max-w-md");
  });

  it("is a bottom sheet on a phone, with the same title and actions", () => {
    phone(true);
    renderDialog();
    const sheet = screen.getByRole("dialog", { name: "Add stock" });
    expect(sheet).toHaveAttribute("data-slot", "drawer-content");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  // jsdom and some old browsers have no matchMedia; that must not crash a form.
  it("falls back to the dialog when the browser can't answer the media query", () => {
    vi.stubGlobal("matchMedia", undefined);
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Add stock" })).toHaveAttribute("data-slot", "dialog-content");
  });
});
