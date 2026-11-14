import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, type StageStatus } from "@/lib/drill";
import { cn } from "@/lib/utils";

/**
 * A drill stage's state as a word on a badge. Shared by the progress list and
 * a cadet's record so "Ready for test" looks the same in both; the word is
 * always there, so nothing hangs on the colour alone.
 */
export function StageStatusBadge({ status, className }: { status: StageStatus; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap",
        status === "complete" && "border-success/40 bg-success/10 text-success",
        status === "ready" && "border-warning/40 bg-warning/10 text-warning",
        status === "in_progress" && "border-primary/30 bg-primary/5 text-primary",
        status === "not_started" && "text-muted-foreground",
        className
      )}
    >
      {STATUS_LABEL[status]}
    </Badge>
  );
}
