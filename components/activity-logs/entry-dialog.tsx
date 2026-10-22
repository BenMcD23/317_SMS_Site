"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "next-auth/react";
import { z } from "zod";

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { ErrorAlert } from "@/components/error-alert";
import { addEntry, editEntry, type CadetActivityLog, type Entry, type SectionKey } from "@/lib/activity-logs";
import { todayLocal } from "@/lib/format";

/** Built per log: an entry must fall between the section's start and today,
 *  the same window the API enforces. */
function entrySchema(startDate: string) {
  return z.object({
    date: z
      .string()
      .min(1, "Choose the day")
      .refine((d) => d <= todayLocal(), "Choose today or an earlier day")
      .refine((d) => d >= startDate, "Choose a day on or after the section's start date"),
    description: z.string().trim().min(1, "Say what they did").max(1000, "Too long"),
    minutes: z
      .number({ error: "Enter the minutes" })
      .int("Whole minutes")
      .min(1, "At least 1")
      .max(600, "Up to 600 (10 hours); split longer days"),
  });
}
type Values = z.infer<ReturnType<typeof entrySchema>>;

/**
 * Adds an entry on a cadet's behalf (when they told staff rather than logging
 * it), or fixes one. `entry` null is adding.
 */
export function EntryDialog({
  cin,
  section,
  startDate,
  entry,
  open,
  onOpenChange,
  onSaved,
}: {
  cin: number;
  section: SectionKey;
  startDate: string;
  entry: Entry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (log: CadetActivityLog) => void;
}) {
  const { data: session } = useSession();
  const form = useForm<Values>({ resolver: zodResolver(entrySchema(startDate)), mode: "onTouched" });
  const { register, handleSubmit, reset, formState } = form;
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open)
      reset(
        entry
          ? { date: entry.date, description: entry.description, minutes: entry.minutes }
          : { date: todayLocal(), description: "", minutes: 60 }
      );
  }, [open, entry, reset]);

  function close() {
    setSubmitError(null);
    onOpenChange(false);
  }

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    const token = session?.id_token ?? "";
    try {
      onSaved(
        entry
          ? await editEntry(token, cin, section, entry.id, values)
          : await addEntry(token, cin, section, values)
      );
      close();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't save the entry.");
    }
  });

  const err = (name: keyof Values) => formState.errors[name]?.message;
  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && close()}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{entry ? "Edit entry" : "Add entry"}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {entry
              ? "Fix the day, what they did or how long."
              : "Something the cadet did that isn't logged yet."}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <form id="entry" onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field data-invalid={!!err("date") || undefined}>
            <FieldLabel htmlFor="entry-date">Date</FieldLabel>
            <Input
              id="entry-date"
              type="date"
              min={startDate}
              max={todayLocal()}
              className="w-fit"
              aria-invalid={!!err("date") || undefined}
              {...register("date")}
            />
            <FieldError>{err("date")}</FieldError>
          </Field>
          <Field data-invalid={!!err("description") || undefined}>
            <FieldLabel htmlFor="entry-description">What they did</FieldLabel>
            <Textarea
              id="entry-description"
              aria-invalid={!!err("description") || undefined}
              {...register("description")}
            />
            <FieldError>{err("description")}</FieldError>
          </Field>
          <Field data-invalid={!!err("minutes") || undefined}>
            <FieldLabel htmlFor="entry-minutes">Minutes</FieldLabel>
            <Input
              id="entry-minutes"
              type="number"
              inputMode="numeric"
              className="w-28"
              aria-invalid={!!err("minutes") || undefined}
              {...register("minutes", { valueAsNumber: true })}
            />
            <FieldDescription>An hour (60) or more makes the week count.</FieldDescription>
            <FieldError>{err("minutes")}</FieldError>
          </Field>
          <ErrorAlert message={submitError} title="Not saved" />
        </form>

        <ResponsiveDialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="entry" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Saving…" : entry ? "Save entry" : "Add entry"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
