"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApiQuery } from "@/lib/use-api-query";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

export default function CommitteeRequestsPage() {
  const router = useRouter();
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
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.requests.map((r) => {
                const style = STATUS_STYLE[r.status];
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/committee/requests/${r.id}`)}
                  >
                    <TableCell className="font-medium">
                      <Link href={`/committee/requests/${r.id}`} className="hover:underline">
                        {r.reference}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate">{r.title}</TableCell>
                    <TableCell>{r.requester_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatGBP(r.total)}</TableCell>
                    <TableCell>
                      <Badge variant={style.variant} className={style.className}>
                        {STATUS_LABELS[r.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
