"use client";

import Link from "next/link";
import { CalendarCheck, MailX, Settings2 } from "lucide-react";

import { DataTable, dataTableColumns } from "@/components/data-table";
import { ListSkeleton } from "@/components/list-skeleton";
import { Button } from "@317/ui-common/components/ui/button";
import { EmptyState } from "@317/ui-common/components/empty-state";
import { ErrorAlert } from "@317/ui-common/components/error-alert";
import { PageHeader } from "@317/ui-common/components/page-header";
import { rateOf } from "@/lib/attendance";
import { formatTimestamp } from "@/lib/format";
import { nightTitle, type ParadeReportList, type ParadeReportSummary } from "@/lib/parade-reports";
import { useApiQuery } from "@/lib/use-api-query";

const col = dataTableColumns<ParadeReportSummary>();
const COLUMNS = [
  col.accessor("date", {
    header: "Night",
    cell: (c) => (
      <Link href={`/attendance/reports/${c.getValue()}`} className="font-medium hover:underline">
        {nightTitle(c.getValue())}
      </Link>
    ),
  }),
  col.accessor((r) => r.counts.absent, { id: "absent", header: "Absent" }),
  col.accessor((r) => r.counts.authorised, { id: "authorised", header: "Authorised" }),
  col.accessor((r) => r.counts.present, { id: "present", header: "Present" }),
  col.accessor((r) => rateOf(r.counts) ?? -1, {
    id: "turnout",
    header: "Turnout",
    cell: (c) => (c.getValue() < 0 ? "—" : `${c.getValue()}%`),
  }),
  col.accessor("emailedAt", {
    header: "Emailed",
    cell: (c) => {
      const at = c.getValue();
      return at ? formatTimestamp(at) : <span className="text-muted-foreground">Not emailed</span>;
    },
  }),
];

export default function ParadeReportsPage() {
  const { data, isLoading, error } = useApiQuery<ParadeReportList>(["parade-reports"], "/api/parade-reports");
  const reports = data?.reports ?? [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Parade Reports"
        description="Each parade night's cadet register: who was absent, who had an authorised absence and who came."
        actions={
          data?.canManage && (
            <Button asChild variant="outline" size="sm">
              <Link href="/attendance/reports/settings">
                <Settings2 />
                Manage
              </Link>
            </Button>
          )
        }
      />

      {isLoading ? (
        <ListSkeleton rows={4} className="h-12" />
      ) : error ? (
        <ErrorAlert message={error.message} title="Could not load parade reports" />
      ) : data && !data.onList ? (
        <EmptyState
          icon={MailX}
          title="You're not on the parade report list"
          description="The reports go to the NCOs staff choose. Ask a member of staff if you need them."
        />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No reports yet"
          description="A report is saved after each Wednesday and Friday parade, once it has been switched on."
        />
      ) : (
        <DataTable
          label="Parade reports"
          data={reports}
          columns={COLUMNS}
          rowKey={(r) => r.date}
          rowHref={(r) => `/attendance/reports/${r.date}`}
          initialSort={{ id: "date", desc: true }}
          columnClassName={{
            authorised: "hidden sm:table-cell",
            present: "hidden sm:table-cell",
            emailedAt: "hidden md:table-cell",
          }}
        />
      )}
    </div>
  );
}
