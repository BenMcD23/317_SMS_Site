import { Bell } from "lucide-react";

import { formatTimestamp } from "@/lib/format";

/**
 * "Cadet notified <when>" on an order item that's waiting on the shelf.
 * Shared by the uniform and badge order pages; it goes once the item is given,
 * when the given stamp takes over.
 */
export function ReadyStamp({
  readyToCollect,
  givenAt,
}: {
  readyToCollect: string | null;
  givenAt: string | null;
}) {
  if (!readyToCollect || givenAt) return null;
  return (
    <div className="bg-primary/10 border-primary/30 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5">
      <Bell className="text-primary h-3 w-3 shrink-0" />
      <p className="text-primary text-xs">Cadet notified {formatTimestamp(readyToCollect)}</p>
    </div>
  );
}
