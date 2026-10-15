import { PackageCheck, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatTimestamp } from "@/lib/format";
import type { GivenEvent } from "@/lib/stores-types";

/**
 * "Given <when> · <who>" for an order item, with an Undo when it can be taken
 * back, and the history once there is one. Shared by the uniform and badge
 * order pages so a give reads and undoes the same way on both.
 *
 * The stamp is the current state. History appears only once something has been
 * undone (until then it would just repeat the stamp), and lists every give and
 * undo so a mistaken hand-over leaves a trace of who made it and who fixed it.
 */
export function GivenStamp({
  givenAt,
  givenBy,
  events,
  onUndo,
  undoing,
  itemLabel,
}: {
  givenAt: string | null;
  givenBy: string | null;
  events?: GivenEvent[];
  /** Omit when the order is completed: an item can't be un-given from a closed order. */
  onUndo?: () => void;
  undoing?: boolean;
  /** What's being given, for the Undo button's accessible name ("Beret"). */
  itemLabel: string;
}) {
  const history = events?.some((e) => e.action === "undone") ? events : [];
  if (!givenAt && history.length === 0) return null;
  return (
    <>
      {givenAt && (
        <div className="bg-success/10 border-success/30 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5">
          <PackageCheck className="text-success h-3 w-3 shrink-0" />
          <p className="text-success min-w-0 flex-1 text-xs">
            Given {formatTimestamp(givenAt)}
            {givenBy && <> · {givenBy}</>}
          </p>
          {onUndo && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-success hover:bg-success/10 hover:text-success h-6 shrink-0 gap-1 px-1.5 text-xs"
              disabled={undoing}
              onClick={onUndo}
              aria-label={`Undo given: ${itemLabel}`}
            >
              <Undo2 className="size-3" />
              Undo
            </Button>
          )}
        </div>
      )}
      {history.length > 0 && (
        <ul className="text-muted-foreground flex flex-col gap-0.5 px-1 text-xs" aria-label="Given history">
          {history.map((e) => (
            <li key={e.id}>
              {e.action === "given" ? "Given" : "Undone"} {formatTimestamp(e.timestamp)}
              {e.by && <> · {e.by}</>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
