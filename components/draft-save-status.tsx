"use client";

import type { ServerSaveStatus } from "@/hooks/useAssessmentDraft";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The one-line note under an assessment sheet saying whether the server has
 * its latest copy. Shared so every sheet words it the same way, and so a
 * failed save is never silent: the assessor knows the work is on the phone
 * only until the next save gets through.
 */
export function DraftSaveStatus({
  status,
  nextSave = "your next change",
}: {
  status: ServerSaveStatus | null;
  /** What triggers the next save, for the failure message. */
  nextSave?: string;
}) {
  if (!status) return null;
  return (
    <p
      role="status"
      className={cn("text-xs", status.state === "failed" ? "text-warning" : "text-muted-foreground")}
    >
      {status.state === "saving" && "Saving to the server…"}
      {status.state === "saved" && `Saved to the server at ${formatTime(status.at)}`}
      {status.state === "failed" &&
        `Couldn't reach the server. Saved on this phone only; it saves again with ${nextSave}.`}
    </p>
  );
}
