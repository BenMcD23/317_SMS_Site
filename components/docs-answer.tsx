"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink, FileSearch } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  answerAsText,
  answerBlocks,
  highlightRuns,
  oneLine,
  type AnswerPart,
  type DocsAnswer,
  type Source,
} from "@/lib/docs-answer";
import { cn } from "@/lib/utils";

/**
 * One docs-assistant answer: the text with clickable [n] citations, then the
 * sources it cites with the exact lines quoted. Clicking a citation jumps to its
 * source and opens the passage around the quote, so staff can check the wording
 * without leaving the page; the document link opens SharePoint at that page.
 */
export function DocsAnswerView({ question, result }: { question: string; result: DocsAnswer }) {
  const [openContext, setOpenContext] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const items = useRef(new Map<number, HTMLLIElement>());
  const byN = new Map(result.sources.map((s) => [s.n, s]));

  if (!result.sources.length) return <NoAnswer question={question} result={result} />;

  const toggleContext = (n: number, open: boolean) =>
    setOpenContext((prev) => {
      const next = new Set(prev);
      if (open) next.add(n);
      else next.delete(n);
      return next;
    });

  const jumpTo = (n: number) => {
    setActive(n);
    if (byN.get(n)?.text) toggleContext(n, true);
    items.current.get(n)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(answerAsText(result));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access.");
    }
  };

  const renderParts = (parts: AnswerPart[]) =>
    parts.map((p, i) =>
      p.kind === "text" ? (
        <span key={i}>{p.text}</span>
      ) : (
        <CitationChip key={i} source={byN.get(p.n)!} onClick={() => jumpTo(p.n)} />
      )
    );

  return (
    <Card>
      <CardHeader>
        <CardDescription>You asked</CardDescription>
        <CardTitle className="leading-snug">{question}</CardTitle>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={copy} aria-label="Copy answer with sources">
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 leading-relaxed">
          {answerBlocks(result.answer, new Set(byN.keys())).map((block, i) =>
            block.kind === "paragraph" ? (
              <p key={i}>{renderParts(block.parts)}</p>
            ) : (
              <ul key={i} className="ml-5 flex list-disc flex-col gap-1.5">
                {block.items.map((item, j) => (
                  <li key={j}>{renderParts(item)}</li>
                ))}
              </ul>
            )
          )}
        </div>

        <section aria-label="Sources" className="flex flex-col gap-3">
          <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Sources</h3>
          <ol className="flex flex-col gap-3">
            {result.sources.map((s) => (
              <SourceItem
                key={s.n}
                source={s}
                active={active === s.n}
                contextOpen={openContext.has(s.n)}
                onContextChange={(open) => toggleContext(s.n, open)}
                ref={(el) => {
                  if (el) items.current.set(s.n, el);
                  else items.current.delete(s.n);
                }}
              />
            ))}
          </ol>
        </section>

        <p className="text-muted-foreground text-xs">
          AI-generated from the documents above. Highlighted lines are quoted from the document; check them
          before acting on the answer.
        </p>
      </CardContent>
    </Card>
  );
}

function CitationChip({ source, onClick }: { source: Source; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Source ${source.n}: ${source.filename}${source.location ? `, ${source.location}` : ""}`}
      title={`${source.filename}${source.location ? ` · ${source.location}` : ""}`}
      className="bg-primary/10 text-primary hover:bg-primary/20 focus-visible:ring-ring/50 mx-0.5 inline-flex h-5 min-w-5 -translate-y-px items-center justify-center rounded px-1 align-middle font-mono text-xs font-medium transition-colors outline-none focus-visible:ring-[3px]"
    >
      {source.n}
    </button>
  );
}

function SourceItem({
  source: s,
  active,
  contextOpen,
  onContextChange,
  ref,
}: {
  source: Source;
  active: boolean;
  contextOpen: boolean;
  onContextChange: (open: boolean) => void;
  ref: (el: HTMLLIElement | null) => void;
}) {
  const quotes = s.quotes ?? [];
  return (
    <li
      ref={ref}
      aria-label={`Source ${s.n}`}
      className={cn(
        "scroll-mt-24 rounded-lg border p-3 transition-colors sm:p-4",
        active && "border-primary/50 bg-primary/5"
      )}
    >
      <div className="flex gap-3">
        <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs">
          {s.n}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-w-0 items-center gap-1 font-medium break-all underline-offset-4 hover:underline"
            >
              {s.filename}
              <ExternalLink className="size-3.5 shrink-0" />
            </a>
            {s.location && <Badge variant="secondary">{s.location}</Badge>}
          </div>

          {quotes.length > 0 ? (
            quotes.map((q, i) => (
              <blockquote
                key={i}
                className="rounded-r-md border-l-2 border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm leading-relaxed"
              >
                “{oneLine(q.text)}”
                {q.location && q.location !== s.location && (
                  <span className="text-muted-foreground mt-1 block text-xs">{q.location}</span>
                )}
              </blockquote>
            ))
          ) : (
            <p className="text-muted-foreground line-clamp-2 text-sm">{s.snippet}</p>
          )}

          {s.text && (
            <Collapsible open={contextOpen} onOpenChange={onContextChange}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground -ml-2 h-7 px-2">
                  <ChevronDown className={cn("transition-transform", contextOpen && "rotate-180")} />
                  {contextOpen ? "Hide context" : "Show in context"}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div
                  aria-label={`Passage from ${s.filename}`}
                  className="bg-muted/50 mt-1 max-h-80 overflow-y-auto rounded-md p-3 text-sm leading-relaxed whitespace-pre-wrap"
                >
                  {highlightRuns(s.text, quotes).map((r, i) =>
                    r.mark ? (
                      <mark key={i} className="text-foreground rounded-sm bg-amber-500/30">
                        {r.text}
                      </mark>
                    ) : (
                      <span key={i}>{r.text}</span>
                    )
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>
    </li>
  );
}

/** Nothing in the documents answers it (or the AI service is down): say so, and point at the nearest documents. */
function NoAnswer({ question, result }: { question: string; result: DocsAnswer }) {
  const related = result.related ?? [];
  return (
    <Card>
      <CardHeader>
        <CardDescription>You asked</CardDescription>
        <CardTitle className="leading-snug">{question}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <FileSearch className="text-muted-foreground mt-0.5 size-5 shrink-0" />
          <p className="leading-relaxed">{result.answer}</p>
        </div>
        {related.length > 0 && (
          <section aria-label="Closest documents" className="flex flex-col gap-2">
            <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              These documents came closest
            </h3>
            <ul className="flex flex-col gap-1.5">
              {related.map((d) => (
                <li key={d.url} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium break-all underline-offset-4 hover:underline"
                  >
                    {d.filename}
                    <ExternalLink className="size-3.5 shrink-0" />
                  </a>
                  {d.location && <span className="text-muted-foreground">{d.location}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
