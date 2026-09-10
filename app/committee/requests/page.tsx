"use client";

import Link from "next/link";
import { useApiQuery } from "@/lib/use-api-query";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Plus, ReceiptText } from "lucide-react";
import {
  type CommitteeRequestSummary, STATUS_LABELS, STATUS_STYLE, formatGBP, formatDate,
} from "@/lib/committee";

interface ListResponse {
  requests: CommitteeRequestSummary[];
  is_oc: boolean;
}

export default function CommitteeRequestsPage() {
  const { data, isLoading, error } = useApiQuery<ListResponse>(
    ["committee-requests"],
    "/committee-requests",
  );

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
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">Failed to load requests: {error.message}</p>
      ) : !data || data.requests.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ReceiptText /></EmptyMedia>
            <EmptyTitle>No committee requests yet</EmptyTitle>
            <EmptyDescription>
              Create a request to get a purchase approved and reimbursed.
            </EmptyDescription>
          </EmptyHeader>
          <Button asChild size="sm">
            <Link href="/committee/requests/new"><Plus /> New Request</Link>
          </Button>
        </Empty>
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
                    onClick={() => { window.location.href = `/committee/requests/${r.id}`; }}
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
