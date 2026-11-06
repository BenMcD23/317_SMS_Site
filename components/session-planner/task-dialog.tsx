"use client";

import { useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, X } from "lucide-react";

import { ErrorAlert } from "@/components/error-alert";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  KIND_LABELS,
  SESSION_KINDS,
  taskFormFrom,
  taskSchema,
  type BankTask,
  type KitItem,
  type SessionKind,
  type TaskForm,
} from "@/lib/session-planner";

/**
 * Add a task to the bank or edit one: what it is, how long it takes, the group
 * size it suits and the kit it needs. Fields sit outside a `<form>`: inside
 * one, Radix Select adds a hidden native select that echoes values back (see
 * `StockItemFields`).
 *
 * A task cadets have led can't be deleted (their history would vanish), only
 * retired with the "In use" switch, so the delete button is offered only when
 * nobody has. The parent gives it a new `key` each time it opens, so the form
 * starts from `task` without an effect to reset it.
 */
export function TaskDialog({
  open,
  onOpenChange,
  task,
  kitList,
  defaultKind,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The task being edited; null to add one. */
  task: BankTask | null;
  kitList: KitItem[];
  /** The kind a new task starts as: whichever the bank is filtered to. */
  defaultKind?: SessionKind;
  onSave: (values: TaskForm) => Promise<void>;
  onDelete?: () => void;
}) {
  const form = useForm<TaskForm>({
    resolver: zodResolver(taskSchema),
    defaultValues: taskFormFrom(task, defaultKind),
    mode: "onTouched",
  });
  const { control, register, handleSubmit, formState } = form;
  const kitRows = useFieldArray({ control, name: "kit" });
  const picked = useWatch({ control, name: "kit" });
  const active = useWatch({ control, name: "active" });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const errorFor = (name: keyof TaskForm) =>
    formState.touchedFields[name] || formState.isSubmitted ? formState.errors[name]?.message : undefined;

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSave(values);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    }
  });

  const unpicked = kitList.filter((k) => !picked?.some((p) => p.kitId === k.id));
  const led = (task?.led_count ?? 0) > 0;
  const nameError = errorFor("name");
  const durationError = errorFor("duration");
  const minError = errorFor("minGroup");
  const maxError = errorFor("maxGroup");

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{task ? `Edit ${task.name}` : "Add task"}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            A stand a session can run. The planner uses the time, group size and kit to fit tasks into rounds.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <Controller
              control={control}
              name="kind"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="task-kind">Kind of session</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={led}>
                    <SelectTrigger id="task-kind" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SESSION_KINDS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {KIND_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {led && (
                    <FieldDescription>
                      Cadets have been assessed on it, so it stays leadership.
                    </FieldDescription>
                  )}
                </Field>
              )}
            />
            <Field>
              <FieldLabel htmlFor="task-number">Number</FieldLabel>
              <Input id="task-number" autoComplete="off" placeholder="e.g. 7" {...register("number")} />
            </Field>
          </div>

          <Field data-invalid={!!nameError || undefined}>
            <FieldLabel htmlFor="task-name">Name</FieldLabel>
            <Input
              id="task-name"
              autoComplete="off"
              placeholder="e.g. Toxic Barrel"
              aria-invalid={!!nameError || undefined}
              {...register("name")}
            />
            <FieldError>{nameError}</FieldError>
          </Field>

          <Field>
            <FieldLabel htmlFor="task-brief">Brief</FieldLabel>
            <Textarea id="task-brief" rows={3} placeholder="What the team has to do" {...register("brief")} />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field data-invalid={!!durationError || undefined}>
              <FieldLabel htmlFor="task-duration">Minutes</FieldLabel>
              <Input
                id="task-duration"
                type="number"
                inputMode="numeric"
                min={1}
                aria-invalid={!!durationError || undefined}
                {...register("duration", { valueAsNumber: true })}
              />
              <FieldError>{durationError}</FieldError>
            </Field>
            <Field data-invalid={!!minError || undefined}>
              <FieldLabel htmlFor="task-min">Smallest group</FieldLabel>
              <Input
                id="task-min"
                inputMode="numeric"
                aria-invalid={!!minError || undefined}
                {...register("minGroup")}
              />
              <FieldError>{minError}</FieldError>
            </Field>
            <Field data-invalid={!!maxError || undefined}>
              <FieldLabel htmlFor="task-max">Largest group</FieldLabel>
              <Input
                id="task-max"
                inputMode="numeric"
                aria-invalid={!!maxError || undefined}
                {...register("maxGroup")}
              />
              <FieldError>{maxError}</FieldError>
            </Field>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Kit it needs</legend>
            {kitRows.fields.length === 0 && (
              <p className="text-muted-foreground text-sm">None. It can run alongside anything.</p>
            )}
            {kitRows.fields.map((row, i) => {
              const item = kitList.find((k) => k.id === row.kitId);
              const quantityError = formState.errors.kit?.[i]?.quantity?.message;
              return (
                <div key={row.id} className="flex flex-wrap items-center gap-2">
                  <span id={`task-kit-${i}-name`} className="min-w-0 flex-1 truncate text-sm">
                    {item?.name ?? "Unknown kit"}
                    {item && <span className="text-muted-foreground"> (have {item.quantity})</span>}
                  </span>
                  <label htmlFor={`task-kit-${i}`} className="sr-only">
                    How many {item?.name ?? "of this kit"}
                  </label>
                  <Input
                    id={`task-kit-${i}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    className="w-20"
                    aria-invalid={!!quantityError || undefined}
                    {...register(`kit.${i}.quantity`, { valueAsNumber: true })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    aria-label={`Remove ${item?.name ?? "kit"}`}
                    onClick={() => kitRows.remove(i)}
                  >
                    <X />
                  </Button>
                  {quantityError && <p className="text-destructive w-full text-sm">{quantityError}</p>}
                </div>
              );
            })}
            {unpicked.length > 0 ? (
              <Select value="" onValueChange={(v) => kitRows.append({ kitId: Number(v), quantity: 1 })}>
                <SelectTrigger aria-label="Add kit to this task" className="w-full sm:w-64">
                  <Plus />
                  <SelectValue placeholder="Add kit" />
                </SelectTrigger>
                <SelectContent>
                  {unpicked.map((k) => (
                    <SelectItem key={k.id} value={String(k.id)}>
                      {k.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              kitList.length === 0 && (
                <p className="text-muted-foreground text-sm">Add kit on the Kit tab first.</p>
              )
            )}
          </fieldset>

          <Controller
            control={control}
            name="active"
            render={({ field }) => (
              <Field orientation="horizontal">
                <Switch id="task-active" checked={field.value} onCheckedChange={field.onChange} />
                <FieldLabel htmlFor="task-active">In use</FieldLabel>
              </Field>
            )}
          />
          {!active && (
            <p className="text-muted-foreground -mt-2 text-sm">
              Retired: the planner won&apos;t pick it, but cadets who led it keep it in their history.
            </p>
          )}

          <ErrorAlert message={submitError} title="Not saved" />
        </div>

        <ResponsiveDialogFooter>
          {onDelete && task && !led && (
            <Button
              type="button"
              variant="outline"
              className="text-destructive sm:mr-auto"
              onClick={onDelete}
            >
              Delete task
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Saving…" : task ? "Save changes" : "Add task"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
