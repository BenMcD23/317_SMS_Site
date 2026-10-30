import { describe, expect, it, vi } from "vitest";

import {
  askStream,
  chartColours,
  chartRows,
  csvName,
  flightBarColours,
  formatChartValue,
  isAskReply,
  isPersonalColumn,
  linkCadets,
  sourcesLine,
  tableCsvRows,
  withoutPersonalColumns,
  type AssistantCall,
  type AssistantChart,
  type AssistantTable,
} from "@/lib/assistant";

const call = (tool: string, ok = true): AssistantCall => ({ tool, args: {}, ok });

const chart = (over: Partial<AssistantChart> = {}): AssistantChart => ({
  type: "bar",
  title: "Cadets by flight",
  labels: ["A", "B", "C"],
  series: [{ name: "Cadets", values: [26, 14, 20] }],
  unit: "",
  ...over,
});

const TABLE: AssistantTable = {
  title: "Oldest cadets",
  columns: ["Name", "Flight", "Date of birth", "Age", "Email", "Attendance %"],
  rows: [
    ["Amy Ashworth", "A", "2008-04-05", 18, "amy@example.com", 90],
    ["Siân Ó Briain", "B", null, null, null, null],
  ],
};

describe("isAskReply", () => {
  const ok = {
    chat: { id: 1, title: "t", created_at: "", updated_at: "" },
    question: { id: 1, role: "user", content: "q", created_at: "" },
    answer: { id: 2, role: "assistant", content: "a", charts: [], tables: [] },
  };

  it("accepts a reply and rejects an error body, a half reply or nothing", () => {
    expect(isAskReply(ok)).toBe(true);
    expect(isAskReply({ detail: "Not authorised" })).toBe(false);
    expect(isAskReply({ ...ok, answer: { content: "a" } })).toBe(false);
    expect(isAskReply({ ...ok, chat: null })).toBe(false);
    expect(isAskReply(null)).toBe(false);
  });
});

describe("sourcesLine", () => {
  it("names what was checked in plain words, once each", () => {
    expect(sourcesLine([call("attendance")])).toBe("Checked attendance");
    expect(sourcesLine([call("find_cadets"), call("cadet_record"), call("cadet_record")])).toBe(
      "Checked cadet search and a cadet's record"
    );
    expect(sourcesLine([call("aggregate"), call("open_orders"), call("stores_stock")])).toBe(
      "Checked squadron figures, open uniform orders and stores stock"
    );
  });

  it("leaves out failed calls, says nothing when none worked, and names an unknown tool as itself", () => {
    expect(sourcesLine([call("cadet_record", false), call("find_cadets")])).toBe("Checked cadet search");
    expect(sourcesLine([call("cadet_record", false)])).toBeNull();
    expect(sourcesLine([])).toBeNull();
    expect(sourcesLine([call("new_tool")])).toBe("Checked new_tool");
  });
});

describe("chartRows", () => {
  it("makes one row per label with a value per series, gaps as null", () => {
    const rows = chartRows(
      chart({
        labels: ["Jan", "Feb"],
        series: [
          { name: "A", values: [80, null] },
          { name: "B", values: [70] },
        ],
      })
    );
    expect(rows).toEqual([
      { label: "Jan", s0: 80, s1: 70 },
      { label: "Feb", s0: null, s1: null },
    ]);
  });
});

describe("chartColours", () => {
  it("colours series in fixed order, never cycling", () => {
    const two = chart({
      series: [
        { name: "Present", values: [1, 2, 3] },
        { name: "Absent", values: [1, 2, 3] },
      ],
    });
    expect(chartColours(two)).toEqual(["var(--chart-1)", "var(--chart-4)"]);
  });

  it("gives flights the colours they have on every other chart", () => {
    const byFlight = chart({
      series: [
        { name: "C", values: [1, 2, 3] },
        { name: "A", values: [1, 2, 3] },
      ],
    });
    expect(chartColours(byFlight)).toEqual(["var(--chart-3)", "var(--chart-4)"]);
    expect(chartColours(chart({ type: "pie" }))).toEqual([
      "var(--chart-4)",
      "var(--chart-5)",
      "var(--chart-3)",
    ]);
  });

  it("colours pie slices in order when they aren't flights", () => {
    expect(chartColours(chart({ type: "pie", labels: ["Cadet", "Cpl"] }))).toEqual([
      "var(--chart-1)",
      "var(--chart-4)",
    ]);
  });
});

describe("flightBarColours", () => {
  it("colours a one-series bar chart of flights by flight, and nothing else", () => {
    expect(flightBarColours(chart())).toEqual(["var(--chart-4)", "var(--chart-5)", "var(--chart-3)"]);
    expect(flightBarColours(chart({ labels: ["Cadet", "Cpl", "Sgt"] }))).toBeNull();
    expect(flightBarColours(chart({ type: "line" }))).toBeNull();
    expect(
      flightBarColours(
        chart({
          series: [
            { name: "x", values: [1, 2, 3] },
            { name: "y", values: [1, 2, 3] },
          ],
        })
      )
    ).toBeNull();
  });
});

describe("formatChartValue", () => {
  it("formats with the chart's unit", () => {
    expect(formatChartValue(1234, "")).toBe("1,234");
    expect(formatChartValue(87.25, "%")).toBe("87.3%");
    expect(formatChartValue(90, "min")).toBe("90 min");
    expect(formatChartValue(null, "%")).toBe("—");
  });
});

describe("personal columns", () => {
  it("recognises date of birth, age and email headings, and nothing else", () => {
    for (const c of ["Date of birth", "DOB", "Age", "Age today", "Email", "E-mail address", "Birthday"]) {
      expect(isPersonalColumn(c), c).toBe(true);
    }
    for (const c of ["Name", "Flight", "Average", "Attendance %", "Page", "Stage"]) {
      expect(isPersonalColumn(c), c).toBe(false);
    }
  });

  it("drops those columns and their cells for Hide personal data", () => {
    expect(withoutPersonalColumns(TABLE)).toEqual({
      title: "Oldest cadets",
      columns: ["Name", "Flight", "Attendance %"],
      rows: [
        ["Amy Ashworth", "A", 90],
        ["Siân Ó Briain", "B", null],
      ],
    });
  });

  it("leaves a table with nothing personal as it was", () => {
    const plain = { title: "t", columns: ["Name"], rows: [["Amy"]] };
    expect(withoutPersonalColumns(plain)).toBe(plain);
  });
});

describe("CSV", () => {
  it("keys each row by column heading, blanks for gaps", () => {
    expect(tableCsvRows(TABLE)[1]).toEqual({
      Name: "Siân Ó Briain",
      Flight: "B",
      "Date of birth": "",
      Age: "",
      Email: "",
      "Attendance %": "",
    });
  });

  it("names the file after the title", () => {
    expect(csvName("Parade turnout by month (2026)")).toBe("parade-turnout-by-month-2026.csv");
    expect(csvName("!!!")).toBe("table.csv");
  });
});

describe("askStream", () => {
  const done = {
    type: "done",
    chat: { id: 1, title: "t", pinned: false, created_at: "", updated_at: "" },
    question: { id: 1, role: "user", content: "q", created_at: "" },
    answer: { id: 2, role: "assistant", content: "a", charts: [], tables: [] },
  };
  const body = { question: "q", chat_id: null, hide_personal: false };

  /** A response whose body arrives in the given chunks, split anywhere. */
  function chunked(chunks: string[], status = 200) {
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        chunks.forEach((x) => c.enqueue(enc.encode(x)));
        c.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(stream, { status }))
    );
  }

  it("reports each step and returns the answer, even with lines split across chunks", async () => {
    const text = [{ type: "step", label: "Thinking" }, { type: "step", label: "Checking attendance" }, done]
      .map((e) => JSON.stringify(e))
      .join("\n");
    chunked([text.slice(0, 7), text.slice(7, 40), text.slice(40)]);
    const steps: string[] = [];
    const reply = await askStream("/x", "tok", body, (s) => steps.push(s));
    expect(steps).toEqual(["Thinking", "Checking attendance"]);
    expect(reply.answer.content).toBe("a");
  });

  it("rejects with the error line's reason", async () => {
    chunked([JSON.stringify({ type: "error", detail: "Down" }) + "\n"]);
    await expect(askStream("/x", "tok", body, () => {})).rejects.toThrow("Down");
  });

  it("rejects with the API's reason when it refuses before streaming", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "Chat not found" }), { status: 404 }))
    );
    await expect(askStream("/x", "tok", body, () => {})).rejects.toThrow("Chat not found");
  });

  it("rejects when the stream ends without an answer, or sends garbage", async () => {
    chunked([JSON.stringify({ type: "step", label: "Thinking" }) + "\n"]);
    await expect(askStream("/x", "tok", body, () => {})).rejects.toThrow("stopped before it answered");
    chunked(["<html>proxy error</html>"]);
    await expect(askStream("/x", "tok", body, () => {})).rejects.toThrow("couldn't read");
    chunked([JSON.stringify({ type: "done", chat: null }) + "\n"]);
    await expect(askStream("/x", "tok", body, () => {})).rejects.toThrow("couldn't read");
  });

  it("an unreachable server says so", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    await expect(askStream("/x", "tok", body, () => {})).rejects.toThrow("Server unreachable.");
  });
});

describe("linkCadets", () => {
  const cadets = [
    { cin: 1, name: "Amy Ash" },
    { cin: 2, name: "Amy Ashworth" },
    { cin: 3, name: "Ó Briain (Siân)" },
  ];

  it("splits text around each name, longest match first", () => {
    expect(linkCadets("Amy Ashworth and Amy Ash.", cadets)).toEqual([
      { kind: "cadet", text: "Amy Ashworth", cin: 2 },
      { kind: "text", text: " and " },
      { kind: "cadet", text: "Amy Ash", cin: 1 },
      { kind: "text", text: "." },
    ]);
  });

  it("treats names as text, not patterns, and leaves text with no names alone", () => {
    expect(linkCadets("Ask Ó Briain (Siân)", cadets)[1]).toEqual({
      kind: "cadet",
      text: "Ó Briain (Siân)",
      cin: 3,
    });
    expect(linkCadets("Nobody here", cadets)).toEqual([{ kind: "text", text: "Nobody here" }]);
    expect(linkCadets("Amy", [])).toEqual([{ kind: "text", text: "Amy" }]);
  });
});
