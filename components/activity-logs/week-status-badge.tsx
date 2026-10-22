import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, STATUS_TONE, type WeekStatus } from "@/lib/activity-logs";

const TONE_CLASS = {
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  destructive: "border-destructive/40 bg-destructive/10 text-destructive",
  muted: "text-muted-foreground",
};

/**
 * One DofE section's state for a week, in the same words on the weekly
 * dashboard and a cadet's own log page.
 */
export function WeekStatusBadge({
  status,
  label,
  className,
}: {
  status: WeekStatus;
  /** Different words in the same colour, e.g. a summary of several sections. */
  label?: string;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(TONE_CLASS[STATUS_TONE[status]], className)}>
      {label ?? STATUS_LABEL[status]}
    </Badge>
  );
}
