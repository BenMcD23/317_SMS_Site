"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { PageHeader } from "@/components/page-header";
import { Stat, StatGroup } from "@/components/stat";
import { StaffComplianceList } from "@/components/staff-compliance-list";
import { formatTimestamp } from "@/lib/format";
import { COMPLIANCE_KEY, complianceCounts, type ComplianceResponse } from "@/lib/staff-compliance";
import { useApiQuery } from "@/lib/use-api-query";

/**
 * DBS, BPSS and mandatory training from the Volunteer Portal. The OC sees
 * every member of staff; anyone else sees their own record (the API decides
 * which). Everything comes from the last 317 Sync, so the page says when that
 * was and where to refresh it.
 */
export default function StaffCompliancePage() {
  const { data, isLoading, error } = useApiQuery<ComplianceResponse>(COMPLIANCE_KEY, "/staff/compliance");
  const staff = Array.isArray(data?.staff) ? data.staff : [];
  const everyone = !!data?.everyone;
  const counts = complianceCounts(staff);
  const synced = staff
    .map((s) => s.synced_at)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="DBS & Training"
        description={
          everyone
            ? "Every member of staff's DBS, BPSS and mandatory training, from the Volunteer Portal."
            : "Your DBS, BPSS and mandatory training, from the Volunteer Portal."
        }
      />

      {isLoading ? (
        <ListSkeleton rows={5} className="h-16" />
      ) : error ? (
        <ErrorAlert message={error.message} title="Couldn't load DBS and training" />
      ) : staff.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={everyone ? "No staff on the roster" : "You're not on the staff roster"}
          description={
            everyone
              ? "Staff appear once the staff scraper has run."
              : "Your sign-in email doesn't match a staff record from SMS, so there's nothing to show."
          }
        />
      ) : (
        <>
          {everyone && (
            <StatGroup className="grid-cols-2 sm:grid-cols-4">
              <Stat
                label="Lapsed or not done"
                value={counts.expired + counts.missing}
                tone={counts.expired + counts.missing ? "destructive" : undefined}
              />
              <Stat
                label={`Due in ${data?.due_within_days ?? 60} days`}
                value={counts.expiring}
                tone={counts.expiring ? "warning" : undefined}
              />
              <Stat label="Up to date" value={counts.ok} />
              <Stat label="Not synced" value={counts.unsynced} />
            </StatGroup>
          )}
          <p className="text-muted-foreground text-sm">
            {synced
              ? `Last read from the portal ${formatTimestamp(synced)}. `
              : "Not read from the portal yet. "}
            Run 317 Sync from{" "}
            <Link href="/tools/scraper" className="underline">
              Bader Scrapers
            </Link>{" "}
            to refresh it. Anyone due gets an email on Friday mornings.
          </p>
          <StaffComplianceList staff={staff} showAll={!everyone} />
        </>
      )}
    </div>
  );
}
