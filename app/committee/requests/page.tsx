"use client";

import Link from "next/link";
import { useApiQuery } from "@/lib/use-api-query";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, dataTableColumns } from "@/components/data-table";
import { Plus, ReceiptText } from "lucide-react";
import {
  type CommitteeRequestSummary,
  STATUS_LABELS,
  STATUS_STYLE,
  formatGBP,
  formatDate,
} from "@/lib/committee";
import { ListSkeleton } from "@/components/list-skeleton";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";

interface ListResponse {
  requests: CommitteeRequestSummary[];
  is_oc: boolean;
}

const col = dataTableColumns<CommitteeRequestSummary>();

// Status sorts by where the request is in its life, not alphabetically.
const STATUS_ORDER = Object.keys(STATUS_LABELS);

const columns = col.columns([
  col.accessor("reference", {
    header: "Reference",
    sortFn: "alphanumeric",
    cell: ({ row }) => (
      <Link href={`/committee/requests/${row.original.id}`} className="font-medium hover:underline">
        {row.original.reference}
      </Link>
    ),
  }),
  col.accessor("title", {
    header: "Title",
    sortFn: "text",
    cell: ({ getValue }) => <span className="block max-w-[16rem] truncate">{getValue()}</span>,
  }),
  col.accessor("requester_name", { header: "Requester", sortFn: "text" }),
  col.accessor("total", {
    header: "Total",
    sortFn: "basic",
    cell: ({ getValue }) => <span className="tabular-nums">{formatGBP(getValue())}</span>,
  }),
  col.accessor((r) => STATUS_ORDER.indexOf(r.status), {
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
  col.accessor((r) => r.created_at ?? "", {
    id: "created_at",
    header: "Submitted",
    sortFn: "text",
    cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.created_at)}</span>,
  }),
]);

export default function CommitteeRequestsPage() {
  const { data, isLoading, error } = useApiQuery<ListResponse>(["committee-requests"], "/committee-requests");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        title="Committee Requests"
        description="Purchase requests submitted to the committee for approval and payment"
        actions={
          <Button asChild size="sm">
            <Link href="/committee/requests/new">
              <Plus /> New Request
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <ErrorAlert message={error.message} title="Could not load requests" />
      ) : !data || data.requests.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="No committee requests yet"
          description="Create a request to get a purchase approved and reimbursed."
        >
          <Button asChild size="sm">
            <Link href="/committee/requests/new">
              <Plus /> New Request
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <DataTable
          label="Committee requests"
          data={data.requests}
          columns={columns}
          rowKey={(r) => r.id}
          rowHref={(r) => `/committee/requests/${r.id}`}
          initialSort={{ id: "created_at", desc: true }}
          columnClassName={{
            requester_name: "hidden sm:table-cell",
            created_at: "hidden md:table-cell",
            total: "text-right",
          }}
        />
      )}
    </div>
  );
}
