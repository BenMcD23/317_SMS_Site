// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CadetLink } from "@/components/cadet-link";

describe("CadetLink", () => {
  it("links the name to the cadet's record", () => {
    render(<CadetLink cin={2100001}>Ó Briain, Aoife</CadetLink>);
    expect(screen.getByRole("link", { name: "Ó Briain, Aoife" })).toHaveAttribute("href", "/cadets/2100001");
  });
});
