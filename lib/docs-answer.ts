/**
 * Shape of the docs assistant's reply and the pure text helpers its page renders
 * with. Kept out of the page so the parsing (citations, lists, highlight ranges)
 * is tested on its own, away from React.
 *
 * The chatbot checks every quote against the source text before sending it, and
 * gives its position as character offsets into `text`; highlighting by offset
 * rather than by searching for the quote means the exact lines it matched are the
 * ones marked, even when the same words appear twice in a passage.
 */

export type Quote = {
  start: number;
  end: number;
  text: string;
  /** "page 14, para 12" for a PDF, "Section name, para 3" for Word. */
  location: string;
  page: number | null;
};

export type Source = {
  n: number;
  filename: string;
  location: string;
  url: string;
  snippet: string;
  score?: number;
  // Optional: absent from chatbot builds before verified quotes, which the page still renders.
  text?: string;
  quotes?: Quote[];
};

export type RelatedDoc = { filename: string; location: string; url: string };

export type DocsAnswer = {
  answer: string;
  found?: boolean;
  sources: Source[];
  related?: RelatedDoc[];
};

export type AnswerPart = { kind: "text"; text: string } | { kind: "cite"; n: number };
export type AnswerBlock =
  { kind: "paragraph"; parts: AnswerPart[] } | { kind: "list"; items: AnswerPart[][] };

/** Splits "Yes [1][2]." into text and citation parts; [n] with no matching source stays as text. */
export function splitCitations(text: string, known: Set<number>): AnswerPart[] {
  const parts: AnswerPart[] = [];
  let last = 0;
  const push = (t: string) => {
    if (!t) return;
    const prev = parts[parts.length - 1];
    if (prev?.kind === "text") prev.text += t;
    else parts.push({ kind: "text", text: t });
  };
  for (const m of text.matchAll(/\[(\d+)\]/g)) {
    const n = Number(m[1]);
    push(text.slice(last, m.index));
    if (known.has(n)) parts.push({ kind: "cite", n });
    else push(m[0]);
    last = m.index + m[0].length;
  }
  push(text.slice(last));
  return parts;
}

/** The answer as paragraphs and "- " bullet lists, each line split into citation parts. */
export function answerBlocks(answer: string, known: Set<number>): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length)
      blocks.push({ kind: "paragraph", parts: splitCitations(paragraph.join(" "), known) });
    paragraph = [];
  };
  for (const raw of answer.split("\n")) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      flush();
      const item = splitCitations(bullet[1], known);
      const prev = blocks[blocks.length - 1];
      if (prev?.kind === "list") prev.items.push(item);
      else blocks.push({ kind: "list", items: [item] });
    } else if (!line) {
      flush();
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

/**
 * The source text cut into marked and unmarked runs for the quotes. Offsets are
 * clamped and overlaps merged, so a bad range from an older chatbot can't throw
 * or duplicate text.
 */
export function highlightRuns(
  text: string,
  quotes: Pick<Quote, "start" | "end">[]
): { text: string; mark: boolean }[] {
  const ranges = quotes
    .map((q) => [Math.max(0, Math.min(q.start, text.length)), Math.max(0, Math.min(q.end, text.length))])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const merged: number[][] = [];
  for (const r of ranges) {
    const prev = merged[merged.length - 1];
    if (prev && r[0] <= prev[1]) prev[1] = Math.max(prev[1], r[1]);
    else merged.push([...r]);
  }
  const runs: { text: string; mark: boolean }[] = [];
  let pos = 0;
  for (const [s, e] of merged) {
    if (s > pos) runs.push({ text: text.slice(pos, s), mark: false });
    runs.push({ text: text.slice(s, e), mark: true });
    pos = e;
  }
  if (pos < text.length) runs.push({ text: text.slice(pos), mark: false });
  return runs;
}

/** Plain-text answer with a numbered source list, for pasting into an email or message. */
export function answerAsText(result: DocsAnswer): string {
  if (!result.sources.length) return result.answer;
  const refs = result.sources.map(
    (s) => `[${s.n}] ${s.filename}${s.location ? `, ${s.location}` : ""} — ${s.url}`
  );
  return `${result.answer}\n\nSources:\n${refs.join("\n")}`;
}

/** Collapses the line breaks PDFs put mid-sentence, for showing a quote inline. */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
