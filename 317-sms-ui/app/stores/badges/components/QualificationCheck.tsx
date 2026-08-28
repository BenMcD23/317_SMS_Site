"use client";

import { AlertTriangle, CheckCircle2, HelpCircle, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { BadgeQualCheck, BadgeQualStatus, CadetQualifications, checkBadgeQualification } from "../badge-qualification";

const STATUS_STYLES: Record<BadgeQualStatus, string> = {
  held: "border-success/30 bg-success/10 text-success",
  higher: "border-primary/30 bg-primary/10 text-primary",
  missing: "border-warning/40 bg-warning/10 text-warning",
  untracked: "border-border bg-muted/50 text-muted-foreground",
};

const STATUS_ICONS: Record<BadgeQualStatus, React.ElementType> = {
  held: CheckCircle2,
  higher: CheckCircle2,
  missing: AlertTriangle,
  untracked: HelpCircle,
};

/**
 * Whether the cadet holds the qualification behind a badge they're being
 * ordered. Renders nothing for badges with no qualification to check against
 * (core badges) unless `showUntracked` — on the order card that line would be
 * noise, but in the new-order dialog it explains the absence of a verdict.
 */
export function QualificationCheck({
  badgeName,
  quals,
  loading = false,
  showUntracked = false,
  className,
}: {
  badgeName: string;
  quals: CadetQualifications | null;
  loading?: boolean;
  showUntracked?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <p className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking qualification…
      </p>
    );
  }

  const check: BadgeQualCheck = checkBadgeQualification(badgeName, quals);
  if (check.status === "untracked" && !showUntracked) return null;

  const Icon = STATUS_ICONS[check.status];

  return (
    <div
      className={cn(
        "flex items-start gap-1.5 rounded-md border px-2.5 py-1.5 text-xs",
        STATUS_STYLES[check.status],
        className
      )}
    >
      <Icon className="mt-px h-3 w-3 shrink-0" />
      <p>
        <span className="font-medium">{check.label}</span>
        {" — "}
        {check.detail}
      </p>
    </div>
  );
}
