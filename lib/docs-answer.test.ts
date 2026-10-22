import { describe, expect, it } from "vitest";

import { answerAsText, answerBlocks, highlightRuns, oneLine, splitCitations } from "@/lib/docs-answer";

describe("splitCitations", () => {
  it("turns [n] for a known source into a citation and keeps the text around it", () => {
    expect(splitCitations("Yes [1][2], with approval.", new Set([1, 2]))).toEqual([
      { kind: "text", text: "Yes " },
      { kind: "cite", n: 1 },
      { kind: "cite", n: 2 },
      { kind: "text", text: ", with approval." },
    ]);
  });

  it("leaves a reference to a source it wasn't given as plain text instead of a dead link", () => {
    expect(splitCitations("See [3] and [1].", new Set([1]))).toEqual([
      { kind: "text", text: "See [3] and " },
      { kind: "cite", n: 1 },
      { kind: "text", text: "." },
    ]);
  });

  it("handles an answer with no citations or no text", () => {
    expect(splitCitations("No refs", new Set([1]))).toEqual([{ kind: "text", text: "No refs" }]);
    expect(splitCitations("", new Set())).toEqual([]);
  });
});

describe("answerBlocks", () => {
  it("groups '- ' lines into one list and joins wrapped lines into paragraphs", () => {
    const blocks = answerBlocks("You need:\n- a DBS [1]\n- approval [2]\n\nOtherwise\nno.", new Set([1, 2]));
    expect(blocks).toEqual([
      { kind: "paragraph", parts: [{ kind: "text", text: "You need:" }] },
      {
        kind: "list",
        items: [
          [
            { kind: "text", text: "a DBS " },
            { kind: "cite", n: 1 },
          ],
          [
            { kind: "text", text: "approval " },
            { kind: "cite", n: 2 },
          ],
        ],
      },
      { kind: "paragraph", parts: [{ kind: "text", text: "Otherwise no." }] },
    ]);
  });

  it("accepts * and • bullets the model sometimes uses instead of '- '", () => {
    const blocks = answerBlocks("* one\n• two", new Set());
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "list", items: [[{ text: "one" }], [{ text: "two" }]] });
  });

  it("gives nothing for an empty answer", () => {
    expect(answerBlocks("  \n\n", new Set())).toEqual([]);
  });
});

describe("highlightRuns", () => {
  const text = "Cadets may stay. Staff must be present. Cadets may stay.";

  it("marks exactly the quoted range, even when the same words appear twice", () => {
    expect(highlightRuns(text, [{ start: 40, end: 56 }])).toEqual([
      { text: "Cadets may stay. Staff must be present. ", mark: false },
      { text: "Cadets may stay.", mark: true },
    ]);
  });

  it("merges overlapping quotes and sorts them", () => {
    const runs = highlightRuns(text, [
      { start: 17, end: 39 },
      { start: 0, end: 10 },
      { start: 5, end: 16 },
    ]);
    expect(runs.filter((r) => r.mark).map((r) => r.text)).toEqual([
      "Cadets may stay.",
      "Staff must be present.",
    ]);
    expect(runs.map((r) => r.text).join("")).toBe(text);
  });

  it("clamps out-of-range offsets and ignores empty or reversed ones instead of throwing", () => {
    const runs = highlightRuns("short", [
      { start: 3, end: 999 },
      { start: 4, end: 2 },
      { start: -5, end: 0 },
    ]);
    expect(runs).toEqual([
      { text: "sho", mark: false },
      { text: "rt", mark: true },
    ]);
  });

  it("returns the whole text unmarked when there are no quotes, and nothing for empty text", () => {
    expect(highlightRuns("abc", [])).toEqual([{ text: "abc", mark: false }]);
    expect(highlightRuns("", [{ start: 0, end: 3 }])).toEqual([]);
  });
});

describe("answerAsText", () => {
  it("appends a numbered source list with locations and links", () => {
    const text = answerAsText({
      answer: "Yes [1].",
      sources: [
        {
          n: 1,
          filename: "ACP 20.pdf",
          location: "page 4, para 12",
          url: "https://sp/ACP.pdf#page=4",
          snippet: "",
        },
        { n: 2, filename: "Guide.docx", location: "", url: "https://sp/Guide.docx", snippet: "" },
      ],
    });
    expect(text).toBe(
      "Yes [1].\n\nSources:\n[1] ACP 20.pdf, page 4, para 12 — https://sp/ACP.pdf#page=4\n[2] Guide.docx — https://sp/Guide.docx"
    );
  });

  it("is just the answer when nothing is cited", () => {
    expect(answerAsText({ answer: "Not found.", sources: [] })).toBe("Not found.");
  });
});

it("oneLine collapses PDF line breaks inside a quote", () => {
  expect(oneLine("  written\napproval   from\n\nthe Wing ")).toBe("written approval from the Wing");
});
