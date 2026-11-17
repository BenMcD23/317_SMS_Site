// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  ItemTimeline,
  givenTimeline,
  logsFormTimeline,
  orderListTimeline,
  readyTimeline,
  stockTimeline,
} from "@/components/item-timeline";

const lines = () =>
  within(screen.getByRole("list", { name: "History" }))
    .getAllByRole("listitem")
    .map((li) => li.textContent);

describe("ItemTimeline", () => {
  it("puts every kind of step in one list, oldest first, each saying who", () => {
    render(
      <ItemTimeline
        events={[
          ...readyTimeline("2026-11-17T19:10:00Z"),
          ...stockTimeline([{ id: "s", action: "removed", timestamp: "2026-11-17T19:00:00Z", by: "QM" }]),
          ...givenTimeline({
            givenAt: "2026-11-17T19:20:00Z",
            givenBy: "Sgt Ng",
            givenEvents: [{ id: "g", action: "given", timestamp: "2026-11-17T19:20:00Z", by: "Sgt Ng" }],
          }),
        ]}
      />
    );
    expect(lines()).toEqual([
      expect.stringMatching(/^Removed from stock · .* · QM$/),
      expect.stringMatching(/^Cadet told it's ready to collect · /),
      expect.stringMatching(/^Given to the cadet · .* · Sgt Ng$/),
    ]);
  });

  // "Undone 21:09" didn't say what was undone.
  it("names the step an undo took back, and greys it apart from the step itself", () => {
    render(
      <ItemTimeline
        events={givenTimeline({
          givenAt: null,
          givenBy: null,
          givenEvents: [
            { id: "a", action: "given", timestamp: "2026-11-17T21:09:00Z", by: "Dev Staff" },
            { id: "b", action: "undone", timestamp: "2026-11-17T21:10:00Z", by: "Dev Staff" },
          ],
        })}
      />
    );
    const [given, undone] = within(screen.getByRole("list", { name: "History" })).getAllByRole("listitem");
    expect(given).toHaveTextContent("Given to the cadet");
    expect(undone).toHaveTextContent("Undid: given (back to waiting)");
    expect(undone.querySelector("span")).toHaveClass("text-muted-foreground");
    expect(given.querySelector("svg")).toHaveClass("text-success");
  });

  it("colours each step by its kind, like the buttons that do it", () => {
    render(
      <ItemTimeline
        events={[
          ...stockTimeline([{ id: "s", action: "removed", timestamp: "2026-11-17T19:00:00Z", by: null }]),
          ...orderListTimeline({
            addedAt: "2026-11-17T19:05:00Z",
            addedBy: null,
            orderedAt: null,
            orderedBy: null,
            receivedAt: null,
            receivedBy: null,
          }),
          ...readyTimeline("2026-11-17T19:10:00Z"),
        ]}
      />
    );
    const icons = within(screen.getByRole("list", { name: "History" }))
      .getAllByRole("listitem")
      .map((li) => li.querySelector("svg")?.getAttribute("class"));
    expect(icons[0]).toContain("text-chart-3");
    expect(icons[1]).toContain("text-chart-5");
    expect(icons[2]).toContain("text-primary");
  });

  it("builds an order list entry's steps from its stamps when it has no history yet", () => {
    render(
      <ItemTimeline
        events={orderListTimeline({
          addedAt: "2026-11-01T10:00:00Z",
          addedBy: "QM",
          orderedAt: "2026-11-02T10:00:00Z",
          orderedBy: "QM",
          receivedAt: "2026-11-09T10:00:00Z",
          receivedBy: "Zoë Ångström",
          history: [],
        })}
      />
    );
    expect(lines()).toEqual([
      expect.stringMatching(/^Added to order list/),
      expect.stringMatching(/^Marked ordered/),
      expect.stringMatching(/^Marked received · .* · Zoë Ångström$/),
    ]);
  });

  it("shows a hand-over from before the history was kept, from its stamp", () => {
    render(<ItemTimeline events={givenTimeline({ givenAt: "2026-01-01T10:00:00Z", givenBy: "QM" })} />);
    expect(lines()).toEqual([expect.stringMatching(/^Given to the cadet · .* · QM$/)]);
  });

  it("dates a logs form step only once the form has been sent", () => {
    expect(logsFormTimeline({ entryId: "e", sentAt: null })).toEqual([]);
    expect(logsFormTimeline(undefined)).toEqual([]);
    render(<ItemTimeline events={logsFormTimeline({ entryId: "e", sentAt: "2026-11-05T10:00:00Z" })} />);
    expect(lines()).toEqual([expect.stringMatching(/^Sent on the logs form · /)]);
  });

  it("shows nothing when nothing has happened", () => {
    const { container } = render(<ItemTimeline events={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
