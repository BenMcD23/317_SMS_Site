"use client";

import { AlertTriangle, CircleCheck, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type BadgeQualStatus, qualStatusLabel } from "@/lib/badge-quals";
import { cn } from "@/lib/utils";

function StatusIcon({ status, className }: { status: BadgeQualStatus["status"]; className?: string }) {
  if (status === "held") return <CircleCheck className={className} />;
  if (status === "expired") return <Clock className={className} />;
  return <AlertTriangle className={className} />;
}

/**
 * The API's verdict on whether SMS backs up the badge being ordered, as a full
 * line for the order form.
 *
 * Renders nothing for a status of "unknown" or a check that hasn't loaded — a
 * badge we couldn't check must look exactly as it did before the check
 * existed, rather than implying something is wrong with it.
 */
export function BadgeQualNotice({
  check,
  className,
}: {
  check: BadgeQualStatus | undefined;
  className?: string;
}) {
  if (!check || check.status === "unknown") return null;
  const held = check.status === "held";

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
        held
          ? "border-success/40 bg-success/10 text-success"
          : "border-warning/40 bg-warning/10 text-warning",
        className
      )}
    >
      <StatusIcon status={check.status} className="mt-0.5 size-3.5 shrink-0" />
      <span className="text-foreground">
        <span className="font-medium">{qualStatusLabel(check.status)}</span> — {check.reason}
      </span>
    </div>
  );
}

/**
 * The same verdict as a chip beside a badge name on an existing order, so the
 * QM sees what the cadet's record says without opening their profile. Only
 * shown when SMS positively fails to back the badge up — a green chip on every
 * other item would be noise on a page that already carries a lot of them.
 */
export function BadgeQualChip({ check }: { check: BadgeQualStatus | undefined }) {
  if (!check || check.status === "held" || check.status === "unknown") return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning ml-2">
          <StatusIcon status={check.status} className="mr-1 size-3" />
          {qualStatusLabel(check.status)}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{check.reason}</TooltipContent>
    </Tooltip>
  );
}
