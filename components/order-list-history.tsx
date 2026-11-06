import { formatTimestamp } from "@/lib/format";
import type { OrderListEvent } from "@/lib/stores-types";

const LABELS: Record<OrderListEvent["action"], string> = {
  added: "Added to order list",
  ordered: "Marked ordered",
  received: "Marked received",
  ordered_undone: "Ordered undone",
  received_undone: "Received undone",
};

/**
 * Every step a badge took on the supplier order list, once one has been
 * undone. Until then it would only repeat the stamps above it; after an
 * undo, it's the only place the cleared step is still recorded.
 */
export function OrderListHistory({ events }: { events?: OrderListEvent[] }) {
  if (!events?.some((e) => e.action.endsWith("_undone"))) return null;
  return (
    <ul className="text-muted-foreground flex flex-col gap-0.5 px-1 text-xs" aria-label="Order list history">
      {events.map((e) => (
        <li key={e.id}>
          {LABELS[e.action] ?? e.action} {formatTimestamp(e.timestamp)}
          {e.by && <> · {e.by}</>}
        </li>
      ))}
    </ul>
  );
}
