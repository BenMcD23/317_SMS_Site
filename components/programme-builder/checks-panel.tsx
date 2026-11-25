"use client";

import { useState } from "react";
import { AlertTriangle, CircleCheck, Info, Lightbulb, OctagonAlert } from "lucide-react";

import { EmptyState } from "@317/ui-common/components/empty-state";
import { SectionHeading } from "@317/ui-common/components/section-heading";
import { Button } from "@317/ui-common/components/ui/button";
import { cn } from "@317/ui-common/lib/utils";
import { formatRelative } from "@/lib/format";
import {
  nightLabel,
  periodLabel,
  programmeApi,
  SEVERITY_LABELS,
  type Issue,
  type Programme,
  type Severity,
  type Suggestion,
  type SuggestionOption,
} from "@/lib/programme-builder";
import type { useProgramme } from "@/components/programme-builder/use-programme";

type Run = ReturnType<typeof useProgramme>["run"];

const ICONS: Record<Severity, { icon: typeof Info; className: string }> = {
  clash: { icon: OctagonAlert, className: "text-destructive" },
  warning: { icon: AlertTriangle, className: "text-warning" },
  info: { icon: Info, className: "text-muted-foreground" },
};

/**
 * Everything the API thinks is worth a second look, worst first, each with a
 * way to find it on the grid and, where there's an obvious answer (a free
 * room), a button that does it. Below, for staff, what to put in each gap
 * and why, with "Fill the gaps" to take the top suggestion everywhere.
 */
export function ChecksPanel({
  programme,
  suggestions,
  onShow,
  run,
  confirm,
}: {
  programme: Programme;
  /** Undefined for NCOs, who can't change anything. */
  suggestions?: Suggestion[];
  onShow: (where: { slotId?: number | null; nightId?: number | null }) => void;
  run: Run;
  confirm: (message: string, action: () => void) => void;
}) {
  const canEdit = programme.can_edit;
  return (
    <div className="flex flex-col gap-6">
      {programme.issues.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="Nothing to check"
          description="No clashes, gaps or missing details."
        />
      ) : (
        <IssueList issues={programme.issues} canEdit={canEdit} onShow={onShow} run={run} />
      )}

      {suggestions && (
        <section aria-label="Suggestions for the gaps" className="flex flex-col gap-3">
          <SectionHeading
            title="Suggestions for the gaps"
            actions={
              suggestions.length > 0 && (
                <Button
                  size="sm"
                  onClick={() =>
                    confirm(
                      `Put the top suggestion in each of the ${suggestions.length} gaps? You can move or remove any of them afterwards.`,
                      () => void run((t) => programmeApi.fill(t, programme.month), "Gaps filled.")
                    )
                  }
                >
                  Fill the gaps
                </Button>
              )
            }
          />
          {suggestions.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No gaps, or nothing in the bank that fits one. Add sessions to the bank to get suggestions.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border" aria-label="Suggestions">
              {suggestions.map((s) => (
                <SuggestionRow
                  key={`${s.night_id}-${s.period}-${s.flight}`}
                  gap={s}
                  programme={programme}
                  run={run}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * Clashes and warnings in full; the notes (no room yet, no one named) folded
 * away, as a filled-in month has dozens and they'd bury what matters.
 */
function IssueList({
  issues,
  canEdit,
  onShow,
  run,
}: {
  issues: Issue[];
  canEdit: boolean;
  onShow: (where: { slotId?: number | null; nightId?: number | null }) => void;
  run: Run;
}) {
  const [showNotes, setShowNotes] = useState(false);
  const serious = issues.filter((i) => i.severity !== "info");
  const notes = issues.filter((i) => i.severity === "info");
  const shown = showNotes || !serious.length ? issues : serious;
  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y rounded-lg border" aria-label="Checks">
        {shown.map((issue, i) => (
          <IssueRow key={i} issue={issue} canEdit={canEdit} onShow={onShow} run={run} />
        ))}
      </ul>
      {serious.length > 0 && notes.length > 0 && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setShowNotes((v) => !v)}>
          {showNotes ? "Hide notes" : `Show ${notes.length} note${notes.length === 1 ? "" : "s"}`}
        </Button>
      )}
    </div>
  );
}

function IssueRow({
  issue,
  canEdit,
  onShow,
  run,
}: {
  issue: Issue;
  canEdit: boolean;
  onShow: (where: { slotId?: number | null; nightId?: number | null }) => void;
  run: Run;
}) {
  const { icon: Icon, className } = ICONS[issue.severity];
  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex gap-2">
        <Icon className={cn("mt-0.5 size-4 shrink-0", className)} aria-hidden />
        <p className="text-sm">
          <span className="sr-only">{SEVERITY_LABELS[issue.severity]}: </span>
          {issue.message}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 pl-6">
        {(issue.slot_ids.length > 0 || issue.night_id) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onShow({ slotId: issue.slot_ids[0], nightId: issue.night_id })}
          >
            Show
          </Button>
        )}
        {canEdit && issue.fix && (
          <Button
            size="sm"
            onClick={() =>
              run(
                (t) => programmeApi.editSlot(t, issue.fix!.slot_id, { room_id: issue.fix!.room_id }),
                "Room changed."
              )
            }
          >
            {issue.fix.label}
          </Button>
        )}
      </div>
    </li>
  );
}

function SuggestionRow({ gap, programme, run }: { gap: Suggestion; programme: Programme; run: Run }) {
  const [top, ...rest] = gap.options;
  const month = programme.month;
  const flightsOf = (slotId?: number) =>
    programme.nights.flatMap((n) => n.slots).find((s) => s.id === slotId)?.flights ?? [];
  return (
    <li className="flex flex-col gap-2 p-3">
      <p className="text-muted-foreground text-xs">
        {nightLabel(gap.date)} · {periodLabel(gap.period)} · {gap.flight} Flight
      </p>
      <OptionLine option={top} gap={gap} month={month} run={run} flights={flightsOf(top.slot_id)} primary />
      {rest.map((o, i) => (
        <OptionLine key={i} option={o} gap={gap} month={month} run={run} flights={flightsOf(o.slot_id)} />
      ))}
    </li>
  );
}

/** Puts one suggestion in its gap: a bank session, or the flight joining one already there. */
export function applySuggestion(
  token: string,
  month: string,
  gap: Pick<Suggestion, "night_id" | "period" | "flight">,
  option: SuggestionOption,
  slotFlights?: string[]
) {
  if (option.kind === "join" && option.slot_id) {
    return programmeApi.editSlot(token, option.slot_id, {
      flights: [...new Set([...(slotFlights ?? []), gap.flight])],
    });
  }
  return programmeApi.addSlot(token, month, {
    night_id: gap.night_id,
    bank_item_id: option.bank_item_id,
    period: gap.period,
    flights: [gap.flight],
    room_id: option.room_id,
  });
}

function OptionLine({
  option,
  gap,
  month,
  run,
  flights,
  primary = false,
}: {
  option: SuggestionOption;
  gap: Suggestion;
  month: string;
  run: Run;
  /** The flights already on the session a "join" adds to. */
  flights: string[];
  primary?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <Lightbulb
        className={cn("mt-0.5 size-4 shrink-0", primary ? "text-primary" : "text-muted-foreground")}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm", primary && "font-medium")}>{option.title}</p>
        <p className="text-muted-foreground text-xs">{option.reason}</p>
      </div>
      <Button
        variant={primary ? "default" : "outline"}
        size="sm"
        aria-label={`Add ${option.title} for ${gap.flight} Flight, ${periodLabel(gap.period)}, ${nightLabel(gap.date)}`}
        onClick={() => run((t) => applySuggestion(t, month, gap, option, flights), `${option.title} added.`)}
      >
        Add
      </Button>
    </div>
  );
}

/** Who changed what, newest first. */
export function HistoryPanel({ programme }: { programme: Programme }) {
  if (!programme.history.length) {
    return <p className="text-muted-foreground text-sm">No changes yet.</p>;
  }
  return (
    <ol className="flex flex-col gap-3" aria-label="Changes">
      {programme.history.map((h, i) => (
        <li key={i} className="border-l-2 pl-3">
          <p className="text-sm">{h.summary}</p>
          <p className="text-muted-foreground text-xs">
            {h.by ?? "Someone"} · {formatRelative(h.at)}
          </p>
        </li>
      ))}
    </ol>
  );
}
