import { Children, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Decorate = (text: string) => ReactNode;

const plain: Decorate = (text) => text;

/**
 * Markdown from the AI write-ups (the assistant, the cadet trend analysis and
 * the inspection audit), GitHub-flavoured so the tables, code and links
 * models write anyway come out as tables, code and links. Raw HTML is never
 * rendered (react-markdown escapes it without rehype-raw) and images are
 * dropped, so model output can't inject markup or load anything. `decorate`
 * turns a run of plain text into something richer (the assistant links
 * cadets' names to their records); it gets text, never markup.
 */
export function AiMarkdown({ text, decorate = plain }: { text: string; decorate?: Decorate }) {
  const d = (children: ReactNode) => Children.map(children, (c) => (typeof c === "string" ? decorate(c) : c));

  const components: Components = {
    h1: ({ children }) => <h4 className="mt-3 text-sm font-semibold first:mt-0">{d(children)}</h4>,
    h2: ({ children }) => <h4 className="mt-3 text-sm font-semibold first:mt-0">{d(children)}</h4>,
    h3: ({ children }) => <h4 className="mt-3 text-sm font-semibold first:mt-0">{d(children)}</h4>,
    h4: ({ children }) => <h4 className="mt-3 text-sm font-semibold first:mt-0">{d(children)}</h4>,
    p: ({ children }) => <p className="text-muted-foreground text-sm">{d(children)}</p>,
    ul: ({ children }) => <ul className="ml-4 list-disc space-y-1 text-sm">{children}</ul>,
    ol: ({ children }) => <ol className="ml-4 list-decimal space-y-1 text-sm">{children}</ol>,
    li: ({ children }) => <li>{d(children)}</li>,
    strong: ({ children }) => <strong className="text-foreground font-semibold">{d(children)}</strong>,
    em: ({ children }) => <em>{d(children)}</em>,
    a: ({ children, href }) => (
      <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-4">
        {children}
      </a>
    ),
    code: ({ children }) => (
      <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">{children}</code>
    ),
    pre: ({ children }) => (
      <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs [&_code]:bg-transparent [&_code]:p-0">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="rounded-lg border">
        <Table>{children}</Table>
      </div>
    ),
    thead: ({ children }) => <TableHeader>{children}</TableHeader>,
    tbody: ({ children }) => <TableBody>{children}</TableBody>,
    tr: ({ children }) => <TableRow>{children}</TableRow>,
    th: ({ children }) => <TableHead>{d(children)}</TableHead>,
    td: ({ children }) => <TableCell>{d(children)}</TableCell>,
  };

  return (
    <div className="space-y-2">
      <Markdown remarkPlugins={[remarkGfm]} components={components} disallowedElements={["img"]}>
        {text}
      </Markdown>
    </div>
  );
}
