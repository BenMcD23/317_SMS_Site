"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { ArchiveRestore, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api-fetch";
import { API_BASE } from "@/lib/config";
import { deletedKindPage, type DeletedRecord } from "@/lib/deleted-records";
import { formatTimestamp } from "@/lib/format";
import { useApiQuery } from "@/lib/use-api-query";

const DELETED_KEY = ["stores", "deleted"];

export default function StoresDeletedPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data, isPending, error } = useApiQuery<DeletedRecord[]>(DELETED_KEY, "/stores/deleted?limit=300");
  // An error body where a list was expected is a failure, not "nothing deleted".
  const records = Array.isArray(data) ? data : [];
  const [restoring, setRestoring] = useState<number | null>(null);

  async function restore(record: DeletedRecord) {
    setRestoring(record.id);
    try {
      await apiRequest(
        session?.id_token ?? "",
        `${API_BASE}/stores/deleted/${record.id}/restore`,
        { method: "POST" },
        "Couldn't restore that."
      );
      const page = deletedKindPage(record.kind);
      toast.success(page ? `Restored. It's back on ${page.name}.` : "Restored.");
      // Every stores list could hold what came back: orders, Logs Forms, order lists.
      await queryClient.invalidateQueries({ queryKey: ["stores"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't restore that.");
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Recently deleted"
        description="Uniform and badge orders, Logs Form entries and badge order list entries that were deleted. Restore one to put it back as it was."
      />

      <ErrorAlert title="Couldn't load what was deleted" message={error?.message ?? null} />

      {isPending && !error && <ListSkeleton rows={6} />}

      {!isPending && !error && records.length === 0 && (
        <EmptyState
          icon={Trash2}
          title="Nothing deleted"
          description="Orders and list entries that are deleted show here, so they can be put back."
        />
      )}

      {records.length > 0 && (
        <ul className="bg-card divide-y rounded-lg border" aria-label="Deleted records">
          {records.map((record) => {
            const page = deletedKindPage(record.kind);
            return (
              <li
                key={record.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
              >
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{record.label}</p>
                  <p className="text-muted-foreground text-xs">
                    Deleted {formatTimestamp(record.deletedAt)}
                    {record.deletedBy && ` by ${record.deletedBy}`}
                  </p>
                  {record.restoredAt && (
                    <p className="text-muted-foreground text-xs">
                      Restored {formatTimestamp(record.restoredAt)}
                      {record.restoredBy && ` by ${record.restoredBy}`}
                      {page && (
                        <>
                          {" · "}
                          <Link href={page.href} className="hover:text-foreground underline">
                            {page.name}
                          </Link>
                        </>
                      )}
                    </p>
                  )}
                </div>
                {!record.restoredAt && (
                  <Button
                    variant="outline"
                    className="h-9"
                    onClick={() => restore(record)}
                    disabled={restoring !== null}
                    aria-label={`Restore ${record.label}`}
                  >
                    <ArchiveRestore data-icon="inline-start" />
                    {restoring === record.id ? "Restoring…" : "Restore"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
