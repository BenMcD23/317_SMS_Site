import { PackageMinus, PackagePlus } from "lucide-react";
import { StockEvent } from "@/lib/stores-types";
import { formatTimestamp } from "@/lib/format";

/**
 * Stock removal/return stamps for an order item, shown under the "notified" and
 * "given" stamps. Shared by the uniform and badge order pages so the two read
 * identically.
 */
export function StockHistory({ events }: { events?: StockEvent[] }) {
  if (!events || events.length === 0) return null;
  return (
    <>
      {events.map((event) => (
        <div key={event.id} className="flex items-center gap-1.5 rounded-md border bg-muted/50 px-2.5 py-1.5">
          {event.action === "removed" ? (
            <PackageMinus className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <PackagePlus className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <p className="text-xs text-muted-foreground">
            {event.action === "removed" ? "Removed from stock" : "Added back to stock"}{" "}
            {formatTimestamp(event.timestamp)}
            {event.by && <> · {event.by}</>}
          </p>
        </div>
      ))}
    </>
  );
}
