"use client";

import Link from "next/link";
import { useApiQuery } from "@/lib/use-api-query";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, dataTableColumns } from "@/components/data-table";
import { Plus, ClipboardList } from "lucide-react";
import { formatDate } from "@/lib/format";
import { type SessionPlanSummary, STATUS_LABELS, STATUS_STYLE } from "@/lib/session-plans";
import { ListSkeleton } from "@/components/list-skeleton";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";

interface ListResponse {
  plans: SessionPlanSummary[];
  is_staff: boolean;
}

export default function SessionPlansPage() {
  const { data, isLoading, error } = useApiQuery<ListResponse>(["session-plans"], "/session-plans");

  // Staff care about the review queue first; for NCOs it's just everyone's
  // plans in one list.
  const awaiting = data?.plans.filter((p) => p.status === "submitted") ?? [];
  const rest = data?.is_staff ? data.plans.filter((p) => p.status !== "submitted") : (data?.plans ?? []);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        title="Session Plans"
        description={
          data?.is_staff
            ? "Plans NCOs have written — approve them or send them back for amendment"
            : "Plan the sessions you're running, and read everyone else's"
        }
        actions={
          <Button asChild size="sm">
            <Link href="/session-plans/new">
              <Plus /> New Plan
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <ErrorAlert message={error.message} title="Could not load session plans" />
      ) : !data || data.plans.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No session plans yet"
          description="Write up a session you're running and send it to staff for approval."
        >
          <Button asChild size="sm">
            <Link href="/session-plans/new">
              <Plus /> New Plan
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <>
          {data.is_staff && awaiting.length > 0 && (
            <PlanTable title={`Awaiting your review (${awaiting.length})`} plans={awaiting} />
          )}
          {rest.length > 0 && (
            <PlanTable
              title={data.is_staff && awaiting.length > 0 ? "Everything else" : undefined}
              plans={rest}
            />
          )}
        </>
      )}
    </div>
  );
}

const col = dataTableColumns<SessionPlanSummary>();

// Status sorts by where the plan is in review, not alphabetically.
const STATUS_ORDER = Object.keys(STATUS_LABELS);

const columns = col.columns([
  col.accessor((p) => p.session_name || "Untitled plan", {
    id: "session",
    header: "Session",
    sortFn: "text",
    cell: ({ row, getValue }) => (
      <Link
        href={`/session-plans/${row.original.id}`}
        className="block max-w-[16rem] truncate font-medium hover:underline"
      >
        {getValue()}
      </Link>
    ),
  }),
  col.accessor("author_name", { header: "Written by", sortFn: "text" }),
  col.accessor((p) => p.session_ic || "—", { id: "session_ic", header: "Session I/C", sortFn: "text" }),
  col.accessor((p) => p.session_date ?? "", {
    id: "session_date",
    header: "Date",
    sortFn: "text",
    cell: ({ row }) => formatDate(row.original.session_date),
  }),
  col.accessor((p) => STATUS_ORDER.indexOf(p.status), {
    id: "status",
    header: "Status",
    sortFn: "basic",
    cell: ({ row }) => {
      const style = STATUS_STYLE[row.original.status];
      return (
        <Badge variant={style.variant} className={style.className}>
          {STATUS_LABELS[row.original.status]}
        </Badge>
      );
    },
  }),
  col.accessor((p) => p.updated_at ?? "", {
    id: "updated_at",
    header: "Last updated",
    sortFn: "text",
    cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.updated_at)}</span>,
  }),
]);

function PlanTable({ title, plans }: { title?: string; plans: SessionPlanSummary[] }) {
  return (
    <div className="flex flex-col gap-2">
      {title && <h2 className="text-muted-foreground text-sm font-medium">{title}</h2>}
      <DataTable
        label={title ?? "Session plans"}
        data={plans}
        columns={columns}
        rowKey={(p) => p.id}
        rowHref={(p) => `/session-plans/${p.id}`}
        columnClassName={{
          author_name: "hidden sm:table-cell",
          session_ic: "hidden md:table-cell",
          updated_at: "hidden md:table-cell",
        }}
      />
    </div>
  );
}
