"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, FileDown, NotebookPen, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { SectionHeading } from "@/components/section-heading";
import { ErrorAlert } from "@/components/error-alert";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { useConfirm } from "@/components/confirm-dialog";
import { EntryDialog } from "@/components/activity-logs/entry-dialog";
import { SetupDialog } from "@/components/activity-logs/setup-dialog";
import { WeekStatusBadge } from "@/components/activity-logs/week-status-badge";
import {
  LEVELS,
  WEEKLY_MINUTES,
  deleteEntry,
  pdfUrl,
  switchOff,
  switchOn,
  type CadetActivityLog,
  type Entry,
  type Level,
  type SectionKey,
  type SectionLog,
  type WeekStatus,
} from "@/lib/activity-logs";
import { apiFetch, errorDetail } from "@/lib/api-fetch";
import { saveResponseAsFile } from "@/lib/download";
import { formatDate } from "@/lib/format";
import { useApiQuery } from "@/lib/use-api-query";

/** This week's state of a section, worked out the same way as the dashboard. */
function thisWeek(log: SectionLog | null): WeekStatus {
  if (!log) return "not_set_up";
  if (log.complete) return "complete";
  if (!log.started) return "not_started";
  if (log.this_week_minutes >= WEEKLY_MINUTES) return "done";
  return log.this_week_minutes ? "some" : "none";
}

type Dialog =
  | { kind: "setup"; section: SectionKey; log: SectionLog | null }
  | { kind: "entry"; section: SectionKey; log: SectionLog; entry: Entry | null }
  | null;

/**
 * One cadet's DofE activity log: each section's plan, progress and entries,
 * with the PDF for the assessor. Staff can do everything the cadet can on the
 * portal, for the cadet who told them rather than logging it.
 */
export default function CadetActivityLogPage() {
  const { cin: cinParam } = useParams<{ cin: string }>() ?? {};
  const cin = Number(cinParam);
  const { data: session } = useSession();
  const token = session?.id_token ?? "";
  const client = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [dialog, setDialog] = useState<Dialog>(null);
  const key = ["activity-logs", "cadet", cin];
  const { data, isLoading, error } = useApiQuery<CadetActivityLog>(key, `/activity-logs/cadets/${cin}`, {
    enabled: Number.isFinite(cin),
  });
  const log = data && Array.isArray(data.sections) ? data : null;

  function saved(next: CadetActivityLog) {
    client.setQueryData(key, next);
    // The week grid on the list page is stale now too.
    void client.invalidateQueries({ queryKey: ["activity-logs", "grid"] });
  }

  async function run(action: () => Promise<CadetActivityLog>, done?: string) {
    try {
      saved(await action());
      if (done) toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  async function downloadPdf(section: SectionKey) {
    try {
      const res = await apiFetch(pdfUrl(cin, section), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok)
        throw new Error(errorDetail(await res.json().catch(() => null)) ?? "Couldn't make the PDF.");
      await saveResponseAsFile(res, `DofE Activity Log - ${section}.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't make the PDF.");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <Button asChild variant="ghost" size="sm" className="-mb-2 -ml-2 w-fit">
        <Link href="/cadets/activity-logs">
          <ArrowLeft />
          DofE Activity Logs
        </Link>
      </Button>
      <PageHeader
        title={log?.name ?? "DofE activity log"}
        description={
          log
            ? log.enabled
              ? `${log.level} DofE activity log`
              : "Not shown on their cadet portal"
            : undefined
        }
        actions={
          log?.enabled && (
            <>
              <div className="flex items-center gap-2">
                <Label id="level-label" className="text-muted-foreground">
                  Level
                </Label>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  aria-labelledby="level-label"
                  value={log.level}
                  onValueChange={(v) =>
                    v &&
                    v !== log.level &&
                    confirm(
                      `Move ${log.name} to ${v}? Their ${log.level} sections are kept but no longer shown.`,
                      () => run(() => switchOn(token, cin, v as Level), `Level changed to ${v}.`)
                    )
                  }
                >
                  {LEVELS.map((l) => (
                    <ToggleGroupItem key={l} value={l} className="px-3">
                      {l}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  confirm(
                    `Switch off ${log.name}'s DofE activity log? It disappears from their portal. Nothing logged is deleted.`,
                    () => run(() => switchOff(token, cin), "DofE activity log switched off.")
                  )
                }
              >
                Switch off
              </Button>
            </>
          )
        }
      />

      <ErrorAlert message={error?.message ?? null} title="Could not load the DofE activity log" />
      {isLoading && <ListSkeleton rows={6} />}

      {log && !log.enabled && (
        <EmptyState
          icon={NotebookPen}
          title="DofE activity log switched off"
          description="The cadet can't see it on the portal. Switching it back on brings back what they'd logged."
        >
          <Button onClick={() => run(() => switchOn(token, cin, "Bronze"), "DofE activity log switched on.")}>
            Switch on (Bronze)
          </Button>
        </EmptyState>
      )}

      {log?.enabled &&
        log.sections.map(({ section, label, log: s }) => (
          <section key={section} aria-labelledby={`${section}-heading`} className="flex flex-col gap-3">
            <SectionHeading
              title={
                <span id={`${section}-heading`} className="flex items-center gap-2">
                  {label}
                  <WeekStatusBadge status={thisWeek(s)} />
                </span>
              }
              description={s ? `${s.weeks_done} of ${s.weeks_needed} weeks done` : "Not set up yet"}
              actions={
                s ? (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => downloadPdf(section)}>
                      <FileDown />
                      PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDialog({ kind: "setup", section, log: s })}
                    >
                      <Pencil />
                      Edit
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => setDialog({ kind: "setup", section, log: null })}>
                    Set up
                  </Button>
                )
              }
            />
            {s ? (
              <SectionBody
                log={s}
                label={label}
                onAdd={() => setDialog({ kind: "entry", section, log: s, entry: null })}
                onEdit={(entry) => setDialog({ kind: "entry", section, log: s, entry })}
                onDelete={(entry) =>
                  confirm(`Delete the ${label} entry for ${formatDate(entry.date)}?`, () =>
                    run(() => deleteEntry(token, cin, section, entry.id), "Entry deleted.")
                  )
                }
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                The cadet sets this up on the portal, or you can set it up for them.
              </p>
            )}
          </section>
        ))}

      {dialog?.kind === "setup" && (
        <SetupDialog
          cin={cin}
          section={dialog.section}
          log={dialog.log}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          onSaved={saved}
        />
      )}
      {dialog?.kind === "entry" && (
        <EntryDialog
          cin={cin}
          section={dialog.section}
          startDate={dialog.log.start_date}
          entry={dialog.entry}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          onSaved={saved}
        />
      )}
      {confirmDialog}
    </div>
  );
}

function SectionBody({
  log,
  label,
  onAdd,
  onEdit,
  onDelete,
}: {
  log: SectionLog;
  label: string;
  onAdd: () => void;
  onEdit: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
}) {
  const plan: [string, string][] = [
    ["Activity", log.activity],
    ["Goal", log.goal],
    ["Assessor", [log.assessor_name, log.assessor_role].filter(Boolean).join(", ") || "Not added yet"],
    ["Timescale", `${log.duration_months} months (${log.weeks_needed} weeks)`],
    ["Dates", `${formatDate(log.start_date)} to ${formatDate(log.end_date)}`],
    [
      "This week",
      `${log.this_week_minutes} min${log.missed.length ? ` · ${log.missed.length} weeks missed` : ""}`,
    ],
  ];
  return (
    <div className="bg-card divide-y rounded-lg border">
      <dl className="grid gap-x-6 gap-y-2 px-4 py-3 text-sm sm:grid-cols-2">
        {plan.map(([k, v]) => (
          <div key={k} className="flex flex-col sm:flex-row sm:gap-3">
            <dt className="text-muted-foreground sm:w-24 sm:shrink-0">{k}</dt>
            <dd className="text-pretty">{v}</dd>
          </div>
        ))}
      </dl>
      <ul aria-label={`${label} entries`} className="divide-y">
        {log.entries.map((e) => (
          <li key={e.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
            <span className="w-24 shrink-0 tabular-nums">{formatDate(e.date)}</span>
            <span className="min-w-0 flex-1 text-pretty">{e.description}</span>
            <span className="text-muted-foreground w-16 tabular-nums">{e.minutes} min</span>
            <span className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${formatDate(e.date)}`}
                onClick={() => onEdit(e)}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${formatDate(e.date)}`}
                onClick={() => onDelete(e)}
              >
                <Trash2 />
              </Button>
            </span>
          </li>
        ))}
        {!log.entries.length && (
          <li className="text-muted-foreground px-4 py-3 text-sm">Nothing logged yet.</li>
        )}
      </ul>
      <div className="px-4 py-2.5">
        <Button variant="ghost" size="sm" onClick={onAdd}>
          <Plus />
          Add entry
        </Button>
      </div>
    </div>
  );
}
