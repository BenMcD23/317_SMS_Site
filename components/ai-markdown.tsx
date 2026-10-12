import type { ReactNode } from "react";

/** `**bold**` runs as <strong>; models bold the fault they're naming even when told not to. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="text-foreground font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    )
  );
}

/**
 * The small slice of markdown the AI write-ups use: `###` headings, `-` and
 * `1.` lists, `**bold**` and paragraphs. Shared by the cadet trend analysis and
 * the inspection audit. Hand-rolled rather than a markdown library so model
 * output can never inject HTML: everything renders as text.
 */
export function AiMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = (key: string) => {
    if (!list) return;
    const items = list.items.map((b, i) => <li key={i}>{inline(b)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={key} className="ml-4 list-decimal space-y-1 text-sm">
          {items}
        </ol>
      ) : (
        <ul key={key} className="ml-4 list-disc space-y-1 text-sm">
          {items}
        </ul>
      )
    );
    list = null;
  };

  const addItem = (ordered: boolean, item: string, key: string) => {
    if (list && list.ordered !== ordered) flush(key);
    list ??= { ordered, items: [] };
    list.items.push(item);
  };

  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (!line) {
      flush(`l-${i}`);
    } else if (line.startsWith("#")) {
      flush(`l-${i}`);
      blocks.push(
        <h4 key={i} className="mt-3 text-sm font-semibold first:mt-0">
          {line.replace(/^#+\s*/, "")}
        </h4>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      addItem(false, line.slice(2), `l-${i}`);
    } else if (numbered) {
      addItem(true, numbered[1], `l-${i}`);
    } else {
      flush(`l-${i}`);
      blocks.push(
        <p key={i} className="text-muted-foreground text-sm">
          {inline(line)}
        </p>
      );
    }
  });
  flush("l-end");

  return <div className="space-y-2">{blocks}</div>;
}
