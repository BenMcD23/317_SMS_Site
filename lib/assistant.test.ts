import { describe, expect, it } from "vitest";

import {
  HISTORY_LIMIT,
  historyFor,
  isAssistantReply,
  sourcesLine,
  type AssistantCall,
  type AssistantTurn,
} from "@/lib/assistant";

const turn = (id: number, question: string, answer: string): AssistantTurn => ({
  id,
  question,
  reply: { answer, calls: [], model: "m", model_label: "M", fallback: false },
});

const call = (tool: string, ok = true): AssistantCall => ({ tool, args: {}, ok });

describe("historyFor", () => {
  it("sends earlier turns as question then answer, oldest first", () => {
    expect(historyFor([turn(0, "How many in A?", "Four."), turn(1, "And B?", "Six.")])).toEqual([
      { role: "user", content: "How many in A?" },
      { role: "assistant", content: "Four." },
      { role: "user", content: "And B?" },
      { role: "assistant", content: "Six." },
    ]);
  });

  it("is empty for a new chat", () => {
    expect(historyFor([])).toEqual([]);
  });

  it("keeps only the most recent messages the API accepts", () => {
    const turns = Array.from({ length: 10 }, (_, i) => turn(i, `q${i}`, `a${i}`));
    const history = historyFor(turns);
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(history.at(-1)).toEqual({ role: "assistant", content: "a9" });
    expect(history[0]).toEqual({ role: "user", content: "q4" });
  });

  it("cuts an answer longer than the API allows rather than having the question refused", () => {
    const [, answer] = historyFor([turn(0, "q", "x".repeat(9000))]);
    expect(answer.content).toHaveLength(8000);
  });
});

describe("isAssistantReply", () => {
  it("accepts a reply and rejects an error body or nothing", () => {
    expect(isAssistantReply({ answer: "ok", calls: [] })).toBe(true);
    expect(isAssistantReply({ detail: "Not authorised" })).toBe(false);
    expect(isAssistantReply({ answer: "ok" })).toBe(false);
    expect(isAssistantReply(null)).toBe(false);
  });
});

describe("sourcesLine", () => {
  it("names what was checked in plain words, once each", () => {
    expect(sourcesLine([call("attendance")])).toBe("Checked attendance");
    expect(sourcesLine([call("find_cadets"), call("cadet_record"), call("cadet_record")])).toBe(
      "Checked cadet search and a cadet's record"
    );
    expect(sourcesLine([call("expiring"), call("open_orders"), call("stores_stock")])).toBe(
      "Checked expiring qualifications, open uniform orders and stores stock"
    );
  });

  it("leaves out failed calls, and says nothing when none worked", () => {
    expect(sourcesLine([call("cadet_record", false), call("find_cadets")])).toBe("Checked cadet search");
    expect(sourcesLine([call("cadet_record", false)])).toBeNull();
    expect(sourcesLine([])).toBeNull();
  });

  it("shows a tool it doesn't know by its own name", () => {
    expect(sourcesLine([call("new_tool")])).toBe("Checked new_tool");
  });
});
