import {
  Bell,
  ClipboardList,
  FileSpreadsheet,
  Inbox,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  RotateCcw,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { formatTimestamp } from "@/lib/format";
import type { GivenEvent, OrderListEvent, StockEvent } from "@/lib/stores-types";
import { cn } from "@317/ui-common/lib/utils";

/**
 * Everything that happened to one order item, oldest first, in one list:
 * hand-overs, stock, the supplier steps, the cadet being told. It replaces
 * four separate stamps and histories, whose "Undone 21:09" didn't say what
 * was undone. Each line says what happened in words, with an icon in the same
 * colour as the button that does it (ordering purple, stock teal, collection
 * navy, given green); an undo is greyed with an undo arrow and names the step
 * it took back.
 */
export type TimelineEvent = {
  id: string;
  at: string;
  by: string | null;
  text: string;
  kind: "given" | "stock" | "order" | "collect";
  icon: LucideIcon;
  /** Takes back an earlier step: greyed, so it reads apart from the step itself. */
  undo?: boolean;
};

const KIND: Record<TimelineEvent["kind"], string> = {
  given: "text-success",
  stock: "text-chart-3",
  order: "text-chart-5",
  collect: "text-primary",
};

export function ItemTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return (
    <ol className="flex flex-col gap-1.5 text-xs" aria-label="History">
      {sorted.map((e) => {
        const Icon = e.undo ? RotateCcw : e.icon;
        return (
          <li key={e.id} className="flex items-start gap-2">
            <Icon
              className={cn("mt-0.5 size-3.5 shrink-0", e.undo ? "text-muted-foreground" : KIND[e.kind])}
              aria-hidden
            />
            <span className={cn("min-w-0", e.undo ? "text-muted-foreground" : "text-foreground")}>
              {e.text}
              <span className="text-muted-foreground">
                {" "}
                · {formatTimestamp(e.at)}
                {e.by && <> · {e.by}</>}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Hand-overs and their undos. An item given before the history was kept has just its stamp. */
export function givenTimeline(item: {
  givenAt: string | null;
  givenBy: string | null;
  givenEvents?: GivenEvent[];
}): TimelineEvent[] {
  const events = item.givenEvents ?? [];
  if (events.length === 0) {
    return item.givenAt
      ? [
          {
            id: "given",
            at: item.givenAt,
            by: item.givenBy,
            text: "Given to the cadet",
            kind: "given",
            icon: PackageCheck,
          },
        ]
      : [];
  }
  return events.map((e) =>
    e.action === "given"
      ? {
          id: `given-${e.id}`,
          at: e.timestamp,
          by: e.by,
          text: "Given to the cadet",
          kind: "given",
          icon: PackageCheck,
        }
      : {
          id: `given-${e.id}`,
          at: e.timestamp,
          by: e.by,
          text: "Undid: given (back to waiting)",
          kind: "given",
          icon: PackageCheck,
          undo: true,
        }
  );
}

export function stockTimeline(events: StockEvent[] | undefined): TimelineEvent[] {
  return (events ?? []).map((e) => ({
    id: `stock-${e.id}`,
    at: e.timestamp,
    by: e.by,
    text: e.action === "removed" ? "Removed from stock" : "Put back in stock",
    kind: "stock",
    icon: e.action === "removed" ? PackageMinus : PackagePlus,
  }));
}

const LIST_STEP: Record<OrderListEvent["action"], { text: string; icon: LucideIcon; undo?: boolean }> = {
  added: { text: "Added to order list", icon: ClipboardList },
  ordered: { text: "Marked ordered", icon: Truck },
  received: { text: "Marked received", icon: Inbox },
  ordered_undone: { text: "Undid: ordered", icon: Truck, undo: true },
  received_undone: { text: "Undid: received", icon: Inbox, undo: true },
};

/**
 * A badge's supplier steps. An entry from before the history was kept has
 * only its stamps, which are turned into the same lines.
 */
export function orderListTimeline(
  entry:
    | {
        addedAt: string;
        addedBy: string | null;
        orderedAt: string | null;
        orderedBy: string | null;
        receivedAt: string | null;
        receivedBy: string | null;
        history?: OrderListEvent[];
      }
    | undefined
): TimelineEvent[] {
  if (!entry) return [];
  const history: OrderListEvent[] = entry.history?.length
    ? entry.history
    : [
        { id: "a", action: "added", timestamp: entry.addedAt, by: entry.addedBy },
        ...(entry.orderedAt
          ? [{ id: "o", action: "ordered" as const, timestamp: entry.orderedAt, by: entry.orderedBy }]
          : []),
        ...(entry.receivedAt
          ? [{ id: "r", action: "received" as const, timestamp: entry.receivedAt, by: entry.receivedBy }]
          : []),
      ];
  return history.map((e) => {
    const step = LIST_STEP[e.action] ?? { text: e.action, icon: ClipboardList };
    return { id: `list-${e.id}`, at: e.timestamp, by: e.by, kind: "order", ...step };
  });
}

/**
 * A uniform item's logs form, once it's been sent to RAFAC. Entries carry no
 * time of their own, so only the form's sending is a dated step.
 */
export function logsFormTimeline(
  entry: { entryId: string; sentAt: string | null } | undefined
): TimelineEvent[] {
  if (!entry?.sentAt) return [];
  return [
    {
      id: `form-sent-${entry.entryId}`,
      at: entry.sentAt,
      by: null,
      text: "Sent on the logs form",
      kind: "order",
      icon: FileSpreadsheet,
    },
  ];
}

export function readyTimeline(readyToCollect: string | null): TimelineEvent[] {
  return readyToCollect
    ? [
        {
          id: "ready",
          at: readyToCollect,
          by: null,
          text: "Cadet told it's ready to collect",
          kind: "collect",
          icon: Bell,
        },
      ]
    : [];
}
