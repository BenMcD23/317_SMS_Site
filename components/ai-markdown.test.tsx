// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AiMarkdown } from "@/components/ai-markdown";

describe("AiMarkdown", () => {
  it("renders headings, numbered priorities and bullets as real structure", () => {
    render(
      <AiMarkdown
        text={[
          "### Top priorities",
          "1. **Shoes**: 8 cadets",
          "2) Berets",
          "### Going well",
          "- Creases",
          "* Hair",
        ].join("\n")}
      />
    );
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual([
      "Top priorities",
      "Going well",
    ]);
    const [ordered, bullets] = screen.getAllByRole("list");
    expect(ordered.tagName).toBe("OL");
    expect(
      within(ordered)
        .getAllByRole("listitem")
        .map((li) => li.textContent)
    ).toEqual(["Shoes: 8 cadets", "Berets"]);
    expect(within(ordered).getByText("Shoes").tagName).toBe("STRONG");
    expect(bullets.tagName).toBe("UL");
    expect(within(bullets).getAllByRole("listitem")).toHaveLength(2);
  });

  it("starts a new list when bullets switch to numbers", () => {
    render(<AiMarkdown text={"- a\n1. b"} />);
    expect(screen.getAllByRole("list").map((l) => l.tagName)).toEqual(["UL", "OL"]);
  });

  it("shows HTML in model output as text instead of rendering it", () => {
    const { container } = render(<AiMarkdown text={'<img src=x onerror="alert(1)"> and **<b>x</b>**'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText(/<img src=x/)).toBeInTheDocument();
  });

  it("leaves unmatched asterisks and empty text alone", () => {
    const { container } = render(<AiMarkdown text={"5 * 3 **not bold"} />);
    expect(container.querySelector("strong")).toBeNull();
    expect(container.textContent).toBe("5 * 3 **not bold");
    const empty = render(<AiMarkdown text="" />);
    expect(empty.container.textContent).toBe("");
  });
});
