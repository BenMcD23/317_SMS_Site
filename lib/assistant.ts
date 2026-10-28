/**
 * Types and helpers for the squadron assistant (/assistant), which answers
 * staff questions from the API's read-only tools. Kept out of the page so the
 * reply check, the history sent back and the tool wording are tested on their
 * own.
 */

export type AssistantCall = { tool: string; args: Record<string, unknown>; ok: boolean };

export type AssistantReply = {
  answer: string;
  calls: AssistantCall[];
  model: string;
  model_label: string;
  fallback: boolean;
};

export type AssistantTurn = { id: number; question: string; reply: AssistantReply };

/** The API keeps this many earlier messages (question and answer each count). */
export const HISTORY_LIMIT = 12;
/** Longest message the API accepts; a longer earlier answer is cut to fit. */
const MESSAGE_LIMIT = 8000;

/**
 * The earlier turns sent with each question, so a follow-up ("and B flight?")
 * has its context. Only the most recent fit: the API refuses more, and the
 * oldest matter least.
 */
export function historyFor(turns: AssistantTurn[]): { role: "user" | "assistant"; content: string }[] {
  return turns
    .flatMap((t) => [
      { role: "user" as const, content: t.question.slice(0, MESSAGE_LIMIT) },
      { role: "assistant" as const, content: t.reply.answer.slice(0, MESSAGE_LIMIT) },
    ])
    .slice(-HISTORY_LIMIT);
}

/** An error body or a misbehaving proxy can arrive as a 200; don't render half a reply. */
export function isAssistantReply(data: unknown): data is AssistantReply {
  const r = data as AssistantReply | null;
  return typeof r?.answer === "string" && Array.isArray(r.calls);
}

const TOOL_LABELS: Record<string, string> = {
  squadron_overview: "squadron numbers",
  find_cadets: "cadet search",
  cadet_record: "a cadet's record",
  expiring: "expiring qualifications",
  attendance: "attendance",
  badge_holders: "badges",
  stores_stock: "stores stock",
  open_orders: "open uniform orders",
  upcoming_events: "upcoming events",
};

/**
 * "Checked attendance and cadet search": what the answer was drawn from, so
 * staff can tell a looked-up answer from one the model wrote without data.
 * Failed calls and repeats are left out.
 */
export function sourcesLine(calls: AssistantCall[]): string | null {
  const labels = [...new Set(calls.filter((c) => c.ok).map((c) => TOOL_LABELS[c.tool] ?? c.tool))];
  if (!labels.length) return null;
  const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
  return `Checked ${list}`;
}
