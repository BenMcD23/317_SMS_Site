"use client";

import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import {
  byUrgency,
  COMPLIANCE_LABEL,
  itemsToChase,
  type ComplianceItem,
  type ComplianceStatus,
  type StaffCompliance,
} from "@/lib/staff-compliance";
import { cn } from "@/lib/utils";

export function ComplianceBadge({ status }: { status: ComplianceStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap",
        status === "ok" && "border-success/40 bg-success/10 text-success",
        status === "expiring" && "border-warning/40 bg-warning/10 text-warning",
        (status === "expired" || status === "missing") &&
          "border-destructive/40 bg-destructive/10 text-destructive"
      )}
    >
      {COMPLIANCE_LABEL[status]}
    </Badge>
  );
}

function when(item: ComplianceItem): string {
  if (item.status === "missing") return "No record on the portal";
  if (!item.expires) return item.achieved ? `Done ${formatDate(item.achieved)}` : "";
  return `${item.status === "expired" ? "Lapsed" : "Expires"} ${formatDate(item.expires)}`;
}

/**
 * Staff and what they have due, worst first, for the OC dashboard: only
 * what needs doing, not what's up to date.
 */
export function StaffComplianceList({ staff }: { staff: StaffCompliance[] }) {
  return (
    <ul className="bg-card divide-y overflow-hidden rounded-lg border">
      {byUrgency(staff).map((s) => {
        const items = itemsToChase(s.items);
        return (
          <li key={s.cin} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{[s.rank, s.name].filter(Boolean).join(" ")}</span>
              {s.status ? (
                <ComplianceBadge status={s.status} />
              ) : (
                <span className="text-muted-foreground text-sm">Not synced from the portal</span>
              )}
            </div>
            {items.length > 0 && (
              <ul className="flex flex-col gap-1">
                {items.map((i) => (
                  <li key={i.key} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span>{i.name}</span>
                    <span
                      className={cn(
                        "text-xs",
                        i.status === "ok" ? "text-muted-foreground" : "",
                        i.status === "expiring" && "text-warning",
                        (i.status === "expired" || i.status === "missing") && "text-destructive"
                      )}
                    >
                      {when(i)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
