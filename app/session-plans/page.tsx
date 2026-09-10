"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApiQuery } from "@/lib/use-api-query";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
            <PlanTable title={`Awaiting your review (${awaiting.length})`} plans={awaiting} showAuthor />
          )}
          {rest.length > 0 && (
            <PlanTable
              title={data.is_staff && awaiting.length > 0 ? "Everything else" : undefined}
              plans={rest}
              showAuthor
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
  const router = useRouter();
  return (
    <div className="flex flex-col gap-2">
      {title && <h2 className="text-muted-foreground text-sm font-medium">{title}</h2>}
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
                  onClick={() => router.push(`/session-plans/${p.id}`)}
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
