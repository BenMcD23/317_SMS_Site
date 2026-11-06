"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { taskLabel, type PickerTask } from "@/lib/session-planner";
import { useApiQuery } from "@/lib/use-api-query";

export type LeadershipExercise = { taskId: number | null; exerciseNo: string; exerciseName: string };

const OTHER = "other";

/** What the picker says after a task's name about a cadet who's led it. */
export function ledNote(led: PickerTask["led"]): string {
  return led === "passed" ? "led, passed" : led === "failed" ? "led, not passed" : "";
}

/**
 * The exercise on a leadership sheet, picked from the session planner's task
 * bank so the planner knows who has led what. Shared by the new-sheet page and
 * the editor so both mark the tasks this cadet has already led.
 *
 * "Not in the bank" (or a bank that's empty or won't load, e.g. with no
 * signal, where the sheet is queued to send later) falls back to typing the
 * number and name, as the paper sheet does. Render it outside a `<form>`
 * (see `StockItemFields`).
 */
export function LeadershipTaskField({
  idPrefix,
  cin,
  cadetName,
  exceptAssessment,
  value,
  onChange,
}: {
  idPrefix: string;
  /** The cadet being assessed, to mark what they've led; null before one is picked. */
  cin: number | null;
  cadetName?: string;
  /** The sheet being edited, so it doesn't count as having led its own task. */
  exceptAssessment?: number;
  value: LeadershipExercise;
  onChange: (next: LeadershipExercise) => void;
}) {
  const params = new URLSearchParams();
  if (cin) params.set("cin", String(cin));
  if (exceptAssessment) params.set("except_assessment", String(exceptAssessment));
  const query = params.toString();
  const { data, isLoading, error } = useApiQuery<PickerTask[]>(
    ["leadership-tasks", cin, exceptAssessment ?? null],
    `/assessments/leadership/tasks${query ? `?${query}` : ""}`
  );
  const tasks = Array.isArray(data) ? data : [];
  // Typed text with no task means the assessor chose "Not in the bank" (or it
  // was written before the bank existed): keep the text boxes showing.
  const [other, setOther] = useState(value.taskId === null && value.exerciseName !== "");
  const bankless = !isLoading && (!!error || tasks.length === 0);
  const freeText = bankless || (value.taskId === null && other);

  const picked = tasks.find((t) => t.id === value.taskId);
  // A sheet already on a task that's since been retired: still show it.
  const missing = value.taskId !== null && !picked && !isLoading;

  function pick(v: string) {
    if (v === OTHER) {
      setOther(true);
      onChange({ taskId: null, exerciseNo: "", exerciseName: "" });
      return;
    }
    const task = tasks.find((t) => String(t.id) === v);
    if (!task) return;
    setOther(false);
    onChange({ taskId: task.id, exerciseNo: task.number ?? "", exerciseName: task.name });
  }

  return (
    <div className="flex flex-col gap-4 sm:col-span-2">
      {!bankless && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-task`}>Task</Label>
          <Select
            value={value.taskId !== null ? String(value.taskId) : other ? OTHER : ""}
            onValueChange={pick}
            disabled={isLoading}
          >
            <SelectTrigger id={`${idPrefix}-task`} className="w-full">
              <SelectValue placeholder={isLoading ? "Loading the task bank…" : "Choose the task"} />
            </SelectTrigger>
            <SelectContent>
              {tasks.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {taskLabel(t)}
                  {t.led && (
                    <>
                      {" "}
                      <span className="text-muted-foreground">({ledNote(t.led)})</span>
                    </>
                  )}
                </SelectItem>
              ))}
              {missing && (
                <SelectItem value={String(value.taskId)}>
                  {taskLabel({ number: value.exerciseNo || null, name: value.exerciseName })} (retired)
                </SelectItem>
              )}
              <SelectSeparator />
              <SelectItem value={OTHER}>Not in the bank</SelectItem>
            </SelectContent>
          </Select>
          {picked?.led && (
            <p className="text-warning flex items-start gap-1.5 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {cadetName || "This cadet"} has already led this task ({ledNote(picked.led)}).
              {picked.led === "failed" && " A re-assessment should be on another task."}
            </p>
          )}
        </div>
      )}
      {bankless && error && (
        <p className="text-muted-foreground text-sm">
          Couldn&apos;t load the task bank, so type the exercise in.
        </p>
      )}
      {freeText && (
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}-exerciseNo`}>Exercise No.</Label>
            <Input
              id={`${idPrefix}-exerciseNo`}
              placeholder="e.g. 3"
              value={value.exerciseNo}
              onChange={(e) => onChange({ ...value, taskId: null, exerciseNo: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}-exerciseName`}>Exercise Name</Label>
            <Input
              id={`${idPrefix}-exerciseName`}
              placeholder="e.g. River Crossing"
              value={value.exerciseName}
              onChange={(e) => onChange({ ...value, taskId: null, exerciseName: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
