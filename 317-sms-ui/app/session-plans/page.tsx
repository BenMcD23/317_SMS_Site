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
import { Plus, ClipboardList } from "lucide-react";
import { formatDate } from "@/lib/format";
import {
  type SessionPlanSummary, STATUS_LABELS, STATUS_STYLE,
} from "@/lib/session-plans";

interface ListResponse {
  plans: SessionPlanSummary[];
  is_staff: boolean;
}

export default function SessionPlansPage() {
  const { data, isLoading, error } = useApiQuery<ListResponse>(
    ["session-plans"],
    "/session-plans",
  );

  // Staff care about the queue first; NCOs only ever see their own plans, so the
  // split is only worth drawing for staff.
  const awaiting = data?.plans.filter((p) => p.status === "submitted") ?? [];
  const rest = data?.is_staff
    ? data.plans.filter((p) => p.status !== "submitted")
    : (data?.plans ?? []);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        title="Session Plans"
        description={
          data?.is_staff
            ? "Plans NCOs have written — approve them or send them back for amendment"
            : "Plan the sessions you're running and send them to staff for approval"
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
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">Failed to load session plans: {error.message}</p>
      ) : !data || data.plans.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ClipboardList /></EmptyMedia>
            <EmptyTitle>No session plans yet</EmptyTitle>
            <EmptyDescription>
              Write up a session you&apos;re running and send it to staff for approval.
            </EmptyDescription>
          </EmptyHeader>
          <Button asChild size="sm">
            <Link href="/session-plans/new"><Plus /> New Plan</Link>
          </Button>
        </Empty>
      ) : (
        <>
          {data.is_staff && awaiting.length > 0 && (
            <PlanTable
              title={`Awaiting your review (${awaiting.length})`}
              plans={awaiting}
              showAuthor
            />
          )}
          {rest.length > 0 && (
            <PlanTable
              title={data.is_staff && awaiting.length > 0 ? "Everything else" : undefined}
              plans={rest}
              showAuthor={data.is_staff}
            />
          )}
        </>
      )}
    </div>
  );
}

function PlanTable({
  title,
  plans,
  showAuthor,
}: {
  title?: string;
  plans: SessionPlanSummary[];
  showAuthor: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {title && <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session</TableHead>
              {showAuthor && <TableHead>Written by</TableHead>}
              <TableHead>Session I/C</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((p) => {
              const style = STATUS_STYLE[p.status];
              return (
                <TableRow
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => { window.location.href = `/session-plans/${p.id}`; }}
                >
                  <TableCell className="max-w-[16rem] truncate font-medium">
                    <Link href={`/session-plans/${p.id}`} className="hover:underline">
                      {p.session_name || "Untitled plan"}
                    </Link>
                  </TableCell>
                  {showAuthor && <TableCell>{p.author_name}</TableCell>}
                  <TableCell>{p.session_ic || "—"}</TableCell>
                  <TableCell>{formatDate(p.session_date)}</TableCell>
                  <TableCell>
                    <Badge variant={style.variant} className={style.className}>
                      {STATUS_LABELS[p.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(p.updated_at)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
