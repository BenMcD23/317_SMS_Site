// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  parseSizingDetails,
  SizingDetailsDisplay,
} from "@/app/stores/uniform/orders/components/sizing-details";

describe("SizingDetailsDisplay", () => {
  it("lists the measurements given, labelled, and leaves out the ones that weren't", () => {
    render(
      <SizingDetailsDisplay
        raw={JSON.stringify({ currentSize: "90/35", biggerSmaller: "bigger", chest: "96cm" })}
      />
    );

    expect(screen.getByText("Current size").nextSibling).toHaveTextContent("90/35");
    expect(screen.getByText("Overall fit").nextSibling).toHaveTextContent("Bigger");
    expect(screen.getByText("Chest").nextSibling).toHaveTextContent("96cm");
    expect(screen.queryByText("Waist")).toBeNull();
  });

  it("says the current size is unknown rather than leaving it out", () => {
    render(
      <SizingDetailsDisplay raw={JSON.stringify({ currentSizeUnknown: true, currentSize: "ignored" })} />
    );

    expect(screen.getByText("Current size").nextSibling).toHaveTextContent("Unknown");
  });

  it("shows plain-text details from older orders as written", () => {
    render(<SizingDetailsDisplay raw="chest 96cm, height 175cm — Zoë's mum says bigger" />);

    expect(screen.getByText("chest 96cm, height 175cm — Zoë's mum says bigger")).toBeInTheDocument();
  });

  it("says there are no details when the JSON holds nothing to show", () => {
    render(<SizingDetailsDisplay raw={JSON.stringify({ biggerSmaller: "", notes: "" })} />);

    expect(screen.getByText("No sizing details")).toBeInTheDocument();
  });

  it("shows an unknown fit value as stored instead of dropping it", () => {
    render(<SizingDetailsDisplay raw={JSON.stringify({ biggerSmaller: "much bigger" })} />);

    expect(screen.getByText("Overall fit").nextSibling).toHaveTextContent("much bigger");
  });
});

describe("parseSizingDetails", () => {
  it("is null for empty or non-JSON text", () => {
    expect(parseSizingDetails("")).toBeNull();
    expect(parseSizingDetails("chest 96")).toBeNull();
  });
});
