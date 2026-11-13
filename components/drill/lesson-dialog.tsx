"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "next-auth/react";
import { z } from "zod";

import { ErrorAlert } from "@/components/error-alert";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { addLesson, renameLesson, type DrillLesson, type DrillStage } from "@/lib/drill";

const schema = z.object({
  name: z.string().trim().min(1, "Enter the lesson's name").max(120, "Keep it under 120 characters"),
});

/** Adds a lesson to a stage, or renames one (which keeps every cadet's record of it). */
export function LessonDialog({
  target,
  onClose,
  onSaved,
}: {
  /** The stage to add to, or the lesson to rename; null when closed. */
  target: { stage: DrillStage; lesson?: DrillLesson } | null;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { data: session } = useSession();
  const { register, handleSubmit, reset, formState } = useForm<{ name: string }>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
    mode: "onTouched",
  });
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (target) reset({ name: target.lesson?.name ?? "" });
  }, [target, reset]);

  function close() {
    setSaveError(null);
    onClose();
  }

  const submit = handleSubmit(async ({ name }) => {
    if (!target) return;
    setSaveError(null);
    try {
      const token = session?.id_token ?? "";
      if (target.lesson) await renameLesson(token, target.lesson.id, name.trim());
      else await addLesson(token, target.stage.id, name.trim());
      await onSaved();
      close();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save the lesson.");
    }
  });

  const renaming = !!target?.lesson;
  return (
    <ResponsiveDialog open={!!target} onOpenChange={(o) => !o && close()}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {renaming ? "Rename lesson" : `Add a lesson to ${target?.stage.name ?? "the stage"}`}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <form id="drill-lesson" onSubmit={submit} noValidate className="flex flex-col gap-4 px-4 sm:px-0">
          <Field data-invalid={!!formState.errors.name || undefined}>
            <FieldLabel htmlFor="lesson-name">Lesson</FieldLabel>
            <Input id="lesson-name" autoComplete="off" {...register("name")} />
            <FieldError>{formState.errors.name?.message}</FieldError>
          </Field>
          <ErrorAlert message={saveError} title="Lesson not saved" />
        </form>
        <ResponsiveDialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="drill-lesson" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Saving…" : renaming ? "Rename lesson" : "Add lesson"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
