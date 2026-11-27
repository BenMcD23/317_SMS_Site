"use client";

import { useParams } from "next/navigation";

import { DataTable, dataTableColumns } from "@/components/data-table";
import { Private } from "@/components/private";
import { Stat, StatGroup } from "@/components/stat";
import { Badge } from "@317/ui-common/components/ui/badge";
import { Skeleton } from "@317/ui-common/components/ui/skeleton";
import { ErrorAlert } from "@317/ui-common/components/error-alert";
import { PageHeader } from "@317/ui-common/components/page-header";
import { SectionHeading } from "@317/ui-common/components/section-heading";
import { cn } from "@317/ui-common/lib/utils";
import { rateOf, STATE_BADGE } from "@/lib/attendance";
import { formatTimestamp } from "@/lib/format";
import { nightTitle, REPORT_SECTIONS, type ParadeReport, type ParadeReportCadet } from "@/lib/parade-reports";
import { useApiQuery } from "@/lib/use-api-query";

const col = dataTableColumns<ParadeReportCadet>();
const COLUMNS = [
  col.accessor("name", { header: "Cadet", cell: (c) => <span className="font-medium">{c.getValue()}</span> }),
  col.accessor((r) => r.rank ?? "", { id: "rank", header: "Rank" }),
  col.accessor((r) => r.flight ?? "", { id: "flight", header: "Flight" }),
  col.accessor((r) => r.status ?? "", {
    id: "status",
    header: "Bader status",
    cell: (c) => (
      // Bader's wording is long ("Present Incorrectly Dressed"): wrap on a phone rather than cut it off.
      <Badge
        variant="outline"
        className={cn("h-auto font-normal whitespace-normal", STATE_BADGE[c.row.original.state])}
      >
        {c.getValue() || "No status"}
      </Badge>
    ),
  }),
];

export default function ParadeReportPage() {
  const { date } = useParams<{ date: string }>();
  const {
    data: report,
    isLoading,
    error,
  } = useApiQuery<ParadeReport>(["parade-reports", date], `/api/parade-reports/${date}`);

  const title = date ? `Parade report, ${nightTitle(date)}` : "Parade report";

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
        <PageHeader title={title} />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error || !report) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
        <PageHeader title={title} />
        <ErrorAlert
          message={error?.message ?? "No report for that night."}
          title="Could not load this report"
        />
      </div>
    );
  }

  const total = report.cadets.length;
  const turnout = rateOf(report.counts);
  const sent = report.emailedAt
    ? `Emailed ${formatTimestamp(report.emailedAt)}`
    : report.generatedBy === "schedule"
      ? "Not emailed: no one on the list could receive it"
      : "Built by hand, not emailed";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title={title}
        description={`Cadets on the register, saved ${formatTimestamp(report.generatedAt)}. ${sent}.`}
      />

      <StatGroup className="grid-cols-2 sm:grid-cols-4">
        <Stat
          label="On the register"
          value={total}
          hint={turnout === null ? undefined : `${turnout}% present`}
        />
        <Stat
          label="Absent"
          value={report.counts.absent}
          tone={report.counts.absent ? "destructive" : undefined}
        />
        <Stat
          label="Authorised absence"
          value={report.counts.authorised}
          tone={report.counts.authorised ? "warning" : undefined}
        />
        <Stat label="Present" value={report.counts.present} tone="success" />
      </StatGroup>

      {REPORT_SECTIONS.map(({ state, title: heading }) => {
        const rows = report.cadets.filter((c) => c.state === state);
        return (
          <section key={state} className="flex flex-col gap-3" aria-label={heading}>
            <SectionHeading title={`${heading} (${rows.length})`} />
            {rows.length === 0 ? (
              <p className="text-muted-foreground text-sm">No one.</p>
            ) : (
              <DataTable
                label={heading}
                data={rows}
                columns={COLUMNS}
                rowKey={(r) => r.cin}
                initialSort={{ id: "name" }}
                columnClassName={{ rank: "hidden sm:table-cell", status: "whitespace-normal" }}
              />
            )}
          </section>
        );
      })}

      {report.emailedTo && report.emailedTo.length > 0 && (
        <Private>
          <p className="text-muted-foreground text-sm">Sent to {report.emailedTo.join(", ")}.</p>
        </Private>
      )}
    </div>
  );
}
