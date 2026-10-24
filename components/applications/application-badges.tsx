import { Badge } from "@/components/ui/badge";
import { deadlineTone } from "@/lib/applications";
import { cn } from "@/lib/utils";

const TONE = {
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/15 text-warning",
  destructive: "border-destructive/40 bg-destructive/10 text-destructive",
};

/** "7 of 15 done", or "Complete" — the figure each application row leads with. */
export function ProgressBadge({ done, total, complete }: { done: number; total: number; complete: boolean }) {
  return (
    <Badge variant="outline" className={cn("tabular-nums", complete && TONE.success)}>
      {complete ? "Complete" : `${done} of ${total} done`}
    </Badge>
  );
}

/**
 * The 18th birthday as a state, shown even with personal data hidden: it says
 * how urgent the application is without giving the date away. Nothing when
 * there's plenty of time.
 */
export function DeadlineBadge({ daysTo18 }: { daysTo18: number | null }) {
  const tone = deadlineTone(daysTo18);
  if (!tone) return null;
  return (
    <Badge variant="outline" className={TONE[tone]}>
      {tone === "destructive" ? "Past 18th birthday" : "18 soon"}
    </Badge>
  );
}
