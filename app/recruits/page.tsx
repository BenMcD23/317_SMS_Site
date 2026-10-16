"use client";

import { useState } from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { DataTable, dataTableColumns } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { AddRecruitDialog } from "@/components/recruits/add-recruit-dialog";
import { RecruitStatusBadge, StepMeter } from "@/components/recruits/recruit-status";
import { copyText } from "@/lib/clipboard";
import { formatDate } from "@/lib/format";
import { recruitName, type Recruit } from "@/lib/recruits";
import { useApiQuery } from "@/lib/use-api-query";

const col = dataTableColumns<Recruit>();

const columns = col.columns([
  col.accessor((r) => `${r.cadetLastName}, ${r.cadetFirstName}`, {
    id: "name",
    header: "Recruit",
    sortFn: "text",
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className="flex min-w-0 flex-col">
          <Link href={`/recruits/${r.id}`} className="font-medium hover:underline">
            {recruitName(r)}
          </Link>
          <span className="text-muted-foreground truncate text-xs">{r.parentName}</span>
        </div>
      );
    },
  }),
  col.accessor((r) => r.progress.done, {
    id: "progress",
    header: "Progress",
    sortFn: "basic",
    cell: ({ row }) => <StepMeter progress={row.original.progress} />,
  }),
  col.accessor((r) => (r.submittedAt ? 3 : r.expired ? 0 : 1), {
    id: "status",
    header: "Status",
    sortFn: "basic",
    cell: ({ row }) => <RecruitStatusBadge recruit={row.original} />,
  }),
  col.accessor("createdAt", {
    header: "Added",
    sortFn: "text",
    cell: ({ getValue }) => <span className="text-muted-foreground">{formatDate(getValue())}</span>,
  }),
]);

export default function RecruitsPage() {
  const { data: recruits = [], isLoading, error, refetch } = useApiQuery<Recruit[]>(["recruits"], "/recruits");
  const [adding, setAdding] = useState(false);

  async function added(recruit: Recruit) {
    void refetch();
    // The link is the thing staff need next, so it goes straight onto the clipboard.
    if (await copyText(recruit.link)) {
      toast.success(`${recruitName(recruit)} added. Their joining link is copied — send it to ${recruit.parentName}.`);
    } else {
      toast.success(`${recruitName(recruit)} added. Open them to copy their joining link.`);
    }
  }

  const waiting = recruits.filter((r) => !r.submittedAt).length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Recruits"
        description={
          isLoading
            ? "Loading…"
            : "Joining forms (3822A and 3822H) that parents fill in online before their child's first parade night." +
              (recruits.length ? ` ${waiting} still to come back.` : "")
        }
        actions={
          <Button onClick={() => setAdding(true)}>
            <UserPlus />
            Add recruit
          </Button>
        }
      />

      <ErrorAlert message={error?.message ?? null} title="Could not load recruits" />

      {isLoading && <ListSkeleton rows={5} />}

      {!isLoading && !error && recruits.length === 0 && (
        <EmptyState
          icon={UserPlus}
          title="No recruits yet"
          description="Add a recruit to get a joining-form link for their parent."
        />
      )}

      {!isLoading && recruits.length > 0 && (
        <DataTable
          label="Recruits"
          data={recruits}
          columns={columns}
          rowKey={(r) => r.id}
          rowHref={(r) => `/recruits/${r.id}`}
          columnClassName={{ createdAt: "hidden sm:table-cell" }}
        />
      )}

      <AddRecruitDialog open={adding} onOpenChange={setAdding} onAdded={added} />
    </div>
  );
}
