"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

import { SearchableSelect } from "@/components/searchable-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { linkSheet, taskLabel, type BankTask, type UnlinkedSheet } from "@/lib/session-planner";

function SheetRow({
  sheet,
  tasks,
  onLinked,
}: {
  sheet: UnlinkedSheet;
  tasks: BankTask[];
  onLinked: () => void;
}) {
  const { data: session } = useSession();
  const [taskId, setTaskId] = useState("");
  const [saving, setSaving] = useState(false);
  const typed = [sheet.exercise_no, sheet.exercise_name].filter(Boolean).join(" ") || "No exercise written";
  const who = `${sheet.rank ? `${sheet.rank} ` : ""}${sheet.first_name} ${sheet.last_name}`;

  async function link() {
    setSaving(true);
    try {
      await linkSheet(session?.id_token ?? "", sheet.assessment_id, Number(taskId));
      toast.success(`${who}'s sheet linked`);
      onLinked();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't link the sheet.");
      setSaving(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{who}</span>
        <span className="text-muted-foreground text-sm">
          &ldquo;{typed}&rdquo; · {formatDate(sheet.date)}{" "}
          <Badge variant="outline" className={sheet.passed ? "text-success" : "text-muted-foreground"}>
            {sheet.passed ? "Passed" : "Not passed"}
          </Badge>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchableSelect
          aria-label={`Task for ${who}'s sheet`}
          value={taskId}
          onValueChange={setTaskId}
          placeholder="Which task was it?"
          className="w-full sm:w-56"
          options={tasks.map((t) => ({
            value: String(t.id),
            label: `${taskLabel(t)}${t.active ? "" : " (retired)"}`,
          }))}
        />
        <Button className="h-9" disabled={!taskId || saving} onClick={link}>
          {saving ? "Linking…" : "Link"}
        </Button>
      </div>
    </li>
  );
}

/**
 * Leadership sheets written before the bank, whose typed exercise matches no
 * task (or more than one). Linking one tells the planner the cadet has led
 * that task, so they aren't given it again. Renders nothing when there are none.
 */
export function UnlinkedSheets({
  sheets,
  tasks,
  onLinked,
}: {
  sheets: UnlinkedSheet[];
  tasks: BankTask[];
  onLinked: () => void;
}) {
  const leadership = tasks.filter((t) => t.kind === "leadership");
  // Nothing to do is the normal state, so it takes no room on the page.
  if (sheets.length === 0) return null;
  return (
    <section id="unlinked" className="flex scroll-mt-20 flex-col gap-3" aria-labelledby="unlinked-heading">
      <h2 id="unlinked-heading" className="text-base font-semibold">
        Leadership sheets to link
      </h2>
      <p className="text-muted-foreground text-sm">
        These were written before the bank and their exercise doesn&apos;t match a task. Link each one so the
        planner knows the cadet has led it.
        {leadership.length === 0 && " Add the leadership tasks first."}
      </p>
      <ul className="bg-card divide-y rounded-lg border">
        {sheets.map((s) => (
          <SheetRow key={s.assessment_id} sheet={s} tasks={leadership} onLinked={onLinked} />
        ))}
      </ul>
    </section>
  );
}
