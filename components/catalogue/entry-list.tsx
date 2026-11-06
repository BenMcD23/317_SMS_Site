import { ArrowDown, ArrowUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Entry = {
  id: number;
  title: string;
  summary: string;
  retired: boolean;
};

/**
 * The framed list both Catalogue tabs use: one row per entry that opens its
 * editor, with move up/down beside it. Reordering is buttons rather than
 * dragging because the list is long and mostly used one-handed on a phone.
 * Retired entries stay in place, muted, so they can be found and restored.
 */
export function EntryList({
  entries,
  noun,
  onOpen,
  onMove,
  busy,
}: {
  entries: Entry[];
  /** "item" or "category", for the buttons' accessible names */
  noun: string;
  onOpen: (id: number) => void;
  onMove: (index: number, by: -1 | 1) => void;
  busy: boolean;
}) {
  return (
    <ul className="bg-card divide-y overflow-hidden rounded-lg border">
      {entries.map((e, i) => (
        <li key={e.id} className="flex items-center gap-1 pr-2">
          <button
            type="button"
            onClick={() => onOpen(e.id)}
            aria-label={`Edit ${e.title}`}
            className="hover:bg-muted/50 focus-visible:ring-ring/50 flex min-h-14 min-w-0 flex-1 flex-col justify-center gap-0.5 px-4 py-2 text-left outline-none focus-visible:ring-[3px]"
          >
            <span className="flex items-center gap-2">
              <span className={cn("truncate font-medium", e.retired && "text-muted-foreground")}>
                {e.title}
              </span>
              {e.retired && <Badge variant="outline">Retired</Badge>}
            </span>
            <span className="text-muted-foreground truncate text-sm">{e.summary}</span>
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={busy || i === 0}
            aria-label={`Move ${e.title} up`}
            onClick={() => onMove(i, -1)}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={busy || i === entries.length - 1}
            aria-label={`Move ${e.title} down`}
            onClick={() => onMove(i, 1)}
          >
            <ArrowDown />
          </Button>
        </li>
      ))}
      {entries.length === 0 && <li className="text-muted-foreground p-4 text-sm">No {noun}s yet.</li>}
    </ul>
  );
}
