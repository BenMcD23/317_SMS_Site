import { CheckCircle2, CloudUpload } from "lucide-react";

/**
 * The top of a marking sheet's "done" screen, shared by the Leadership, Radio,
 * Space and MOI sheets. Says plainly whether the sheet reached the server or
 * is waiting on this phone for signal (lib/outbox.ts), so nobody walks away
 * thinking a queued sheet is already recorded.
 */
export function SavedHeading({
  title,
  what,
  queued,
  assessmentId,
}: {
  /** "Assessment Saved", "Checklist Saved". */
  title: string;
  /** "Ava Smith's radio assessment". */
  what: string;
  queued: boolean;
  assessmentId: number | null;
}) {
  const Icon = queued ? CloudUpload : CheckCircle2;
  return (
    <>
      <div className="bg-success/20 flex h-16 w-16 items-center justify-center rounded-full">
        <Icon className="text-success h-8 w-8" />
      </div>
      <div className="space-y-1">
        <h2 className="text-foreground text-xl font-semibold">{queued ? "Saved on this phone" : title}</h2>
        <p className="text-muted-foreground text-sm">
          {queued
            ? `No signal, so ${what} is kept here and sends by itself when you're back online.`
            : `${what} has been recorded.`}
        </p>
        {assessmentId && <p className="text-muted-foreground mt-1 text-xs">Assessment ID: #{assessmentId}</p>}
      </div>
    </>
  );
}
