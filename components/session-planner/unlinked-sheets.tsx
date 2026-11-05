"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
        <Select value={taskId} onValueChange={setTaskId}>
          <SelectTrigger aria-label={`Task for ${who}'s sheet`} className="w-full sm:w-56">
            <SelectValue placeholder="Which task was it?" />
          </SelectTrigger>
          <SelectContent>
            {tasks.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {taskLabel(t)}
                {!t.active && " (retired)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
 * that task, so they aren't given it again.
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
  if (sheets.length === 0)
    return (
      <EmptyState
        icon={Link2}
        title="Every leadership sheet is on a task"
        description="Sheets whose exercise matches no task in the bank show up here to link by hand."
      />
    );
  return (
    <div className="flex flex-col gap-3">
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
    </div>
  );
}
