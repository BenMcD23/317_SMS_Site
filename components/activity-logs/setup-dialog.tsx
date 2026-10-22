"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ErrorAlert } from "@/components/error-alert";
import {
  DURATIONS,
  SECTIONS,
  saveSetup,
  type CadetActivityLog,
  type SectionKey,
  type SectionLog,
} from "@/lib/activity-logs";
import { todayLocal } from "@/lib/format";

const schema = z.object({
  activity: z.string().trim().min(1, "Enter the activity").max(300, "Too long"),
  goal: z.string().trim().min(1, "Enter their goal").max(1000, "Too long"),
  assessor_name: z.string().trim().max(120, "Too long"),
  assessor_role: z.string().trim().max(120, "Too long"),
  duration_months: z.number({ error: "Choose how long" }),
  start_date: z.string().min(1, "Choose a start date"),
});
type Values = z.infer<typeof schema>;

function defaults(log: SectionLog | null): Values {
  return {
    activity: log?.activity ?? "",
    goal: log?.goal ?? "",
    assessor_name: log?.assessor_name ?? "",
    assessor_role: log?.assessor_role ?? "",
    duration_months: log?.duration_months ?? (undefined as unknown as number),
    start_date: log?.start_date ?? todayLocal(),
  };
}

/**
 * Sets a section up for a cadet, or changes it: the same plan the cadet fills
 * in on the portal. Entries already logged are kept.
 */
export function SetupDialog({
  cin,
  section,
  log,
  open,
  onOpenChange,
  onSaved,
}: {
  cin: number;
  section: SectionKey;
  log: SectionLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (log: CadetActivityLog) => void;
}) {
  const { data: session } = useSession();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults(log),
    mode: "onTouched",
  });
  const { register, control, handleSubmit, reset, formState } = form;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const label = SECTIONS.find((s) => s.key === section)?.label ?? section;

  // Each opening starts from what's saved now, not what was typed last time.
  useEffect(() => {
    if (open) reset(defaults(log));
  }, [open, log, reset]);

  function close() {
    setSubmitError(null);
    onOpenChange(false);
  }

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      onSaved(await saveSetup(session?.id_token ?? "", cin, section, values));
      close();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't save the section.");
    }
  });

  const err = (name: keyof Values) => formState.errors[name]?.message;
  const text = (name: keyof Values, labelText: string, multiline = false) => (
    <Field data-invalid={!!err(name) || undefined}>
      <FieldLabel htmlFor={`setup-${name}`}>{labelText}</FieldLabel>
      {multiline ? (
        <Textarea id={`setup-${name}`} aria-invalid={!!err(name) || undefined} {...register(name)} />
      ) : (
        <Input id={`setup-${name}`} aria-invalid={!!err(name) || undefined} {...register(name)} />
      )}
      <FieldError>{err(name)}</FieldError>
    </Field>
  );

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && close()}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{log ? `Edit ${label}` : `Set up ${label}`}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>What&apos;s logged so far is kept.</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <form id="setup" onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {text("activity", "Activity")}
          {text("goal", "Goal", true)}
          <Field data-invalid={!!err("duration_months") || undefined}>
            <FieldLabel id="setup-duration">Timescale</FieldLabel>
            <Controller
              control={control}
              name="duration_months"
              render={({ field }) => (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  aria-labelledby="setup-duration"
                  value={field.value ? String(field.value) : ""}
                  onValueChange={(v) => v && field.onChange(Number(v))}
                  className="w-full"
                >
                  {DURATIONS.map((m) => (
                    <ToggleGroupItem key={m} value={String(m)} className="h-9 flex-1">
                      {m} months
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            />
            <FieldError>{err("duration_months")}</FieldError>
          </Field>
          <Field data-invalid={!!err("start_date") || undefined}>
            <FieldLabel htmlFor="setup-start_date">Start date</FieldLabel>
            <Input id="setup-start_date" type="date" className="w-fit" {...register("start_date")} />
            <FieldError>{err("start_date")}</FieldError>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("assessor_name", "Assessor's name")}
            {text("assessor_role", "Assessor's role")}
          </div>
          <ErrorAlert message={submitError} title="Not saved" />
        </form>

        <ResponsiveDialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="setup" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Saving…" : "Save section"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
