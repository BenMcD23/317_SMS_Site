"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarRange, History } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-dialog";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { SectionHeading } from "@/components/section-heading";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { apiRequest } from "@/lib/api-fetch";
import { API_BASE, OWNER_EMAIL } from "@/lib/config";
import { formatTimestamp } from "@/lib/format";
import { importSummary, monthLabel, type ImportedMonth, type ImportResult } from "@/lib/programme";
import { useApiQuery } from "@/lib/use-api-query";

// The month a full backfill starts from: the earliest programme docs in this layout.
export const BACKFILL_FROM = "2024-01";

/**
 * The Programme page's second job: copy a month's programme into the site
 * as data, for the stats page's turnout by programme and the assistant. The
 * same month picker as publishing; the list shows what's in. The owner can
 * also pull in every past month at once, which runs in the background.
 */
export function ProgrammeRecord({ month, year }: { month: string; year: string }) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [importing, setImporting] = useState(false);
  const months = useApiQuery<ImportedMonth[]>(["programme", "months"], "/programme/months");
  const token = session?.id_token;
  const isOwner = (session?.user?.email ?? "").toLowerCase() === OWNER_EMAIL.toLowerCase();
  const picked = monthLabel(`${year}-${month.padStart(2, "0")}`);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["programme"] });
  };

  const importMonth = async () => {
    if (!token) return;
    setImporting(true);
    try {
      const result = await apiRequest<ImportResult>(
        token,
        `${API_BASE}/programme/import`,
        { method: "POST", body: { month: Number(month), year: Number(year) } },
        "Couldn't import the programme."
      );
      if (result.skipped) toast.error(importSummary(result));
      else toast.success(importSummary(result));
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const backfill = () =>
    confirm(
      `Import every month's programme since ${monthLabel(BACKFILL_FROM)}? It replaces what's there for those months and takes a few minutes.`,
      async () => {
        if (!token) return;
        try {
          const res = await apiRequest<{ months: number }>(
            token,
            `${API_BASE}/programme/backfill`,
            { method: "POST", body: { start: BACKFILL_FROM } },
            "Couldn't start the import."
          );
          toast.success(
            `Importing ${res.months} months in the background. Refresh this list in a few minutes.`
          );
        } catch (e) {
          toast.error((e as Error).message);
        }
      }
    );

  return (
    <section className="flex flex-col gap-3" aria-label="Programme for the stats">
      <SectionHeading
        title="Programme for the stats"
        description="Copies what each flight does each night into the site, so the stats page can set turnout against it. Each Sunday evening last, this and next month are re-read automatically."
      />
      <div className="flex flex-wrap gap-2">
        <Button className="h-9" onClick={importMonth} disabled={importing || !session}>
          {importing ? <Spinner data-icon="inline-start" /> : <CalendarRange data-icon="inline-start" />}
          {importing ? "Importing…" : `Import ${picked}`}
        </Button>
        {isOwner && (
          <Button variant="outline" className="h-9" onClick={backfill} disabled={!session}>
            <History data-icon="inline-start" />
            Import all since {monthLabel(BACKFILL_FROM)}
          </Button>
        )}
      </div>

      {months.error ? (
        <ErrorAlert title="Couldn't load the imported months" message={months.error.message} />
      ) : months.isLoading || !months.data ? (
        <ListSkeleton rows={3} className="h-10" />
      ) : months.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">No months imported yet.</p>
      ) : (
        <ul aria-label="Imported months" className="bg-card divide-y rounded-lg border">
          {months.data.map((m) => (
            <li
              key={m.month}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5"
            >
              <span className="text-sm font-medium">{monthLabel(m.month)}</span>
              <span className="text-muted-foreground text-xs">
                {m.nights} night{m.nights === 1 ? "" : "s"} · {m.sessions} session
                {m.sessions === 1 ? "" : "s"}
                {m.imported_at && ` · ${formatTimestamp(m.imported_at)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {confirmDialog}
    </section>
  );
}
