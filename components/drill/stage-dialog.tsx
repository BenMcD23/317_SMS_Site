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
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { saveStage, type DrillStage } from "@/lib/drill";

type Values = { name: string; test_name: string; max_score: string; pass_mark: string };

const whole = (label: string, min: number) =>
  z
    .string()
    .trim()
    .refine(
      (v) => v === "" || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= 1000),
      `${label}: a whole number from ${min} to 1000`
    );

/** The API's stage rules (routers/drill.py StageIn), so mistakes show under the field. */
export const stageSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(120, "Keep it under 120 characters"),
    test_name: z.string().trim().max(120, "Keep it under 120 characters"),
    max_score: whole("Maximum score", 1),
    pass_mark: whole("Pass mark", 0),
  })
  .superRefine((v, ctx) => {
    if (!v.test_name && (v.max_score || v.pass_mark)) {
      ctx.addIssue({ code: "custom", path: ["test_name"], message: "Name the test, or clear the scores" });
    }
    if (v.max_score && v.pass_mark && Number(v.pass_mark) > Number(v.max_score)) {
      ctx.addIssue({ code: "custom", path: ["pass_mark"], message: "Can't be more than the maximum score" });
    }
  });

const blank = (stage?: DrillStage | null): Values => ({
  name: stage?.name ?? "",
  test_name: stage ? (stage.test_name ?? "") : "5x5 drill test",
  max_score: stage ? (stage.max_score?.toString() ?? "") : "25",
  pass_mark: stage?.pass_mark?.toString() ?? "",
});

/** Adds a drill stage, or edits one's name and test. Staff only. */
export function StageDialog({
  open,
  stage,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  stage: DrillStage | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<unknown>;
}) {
  const { data: session } = useSession();
  const { register, handleSubmit, reset, formState } = useForm<Values>({
    resolver: zodResolver(stageSchema),
    defaultValues: blank(stage),
    mode: "onTouched",
  });
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (open) reset(blank(stage));
  }, [open, stage, reset]);

  function close() {
    setSaveError(null);
    onOpenChange(false);
  }

  const submit = handleSubmit(async (v) => {
    setSaveError(null);
    try {
      await saveStage(
        session?.id_token ?? "",
        {
          name: v.name.trim(),
          test_name: v.test_name.trim() || null,
          max_score: v.max_score ? Number(v.max_score) : null,
          pass_mark: v.pass_mark ? Number(v.pass_mark) : null,
        },
        stage?.id
      );
      await onSaved();
      close();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save the stage.");
    }
  });

  const e = formState.errors;
  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && close()}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{stage ? "Edit stage" : "Add stage"}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            A stage ends with a test. Leave the pass mark empty to say pass or fail yourself.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <form id="drill-stage" onSubmit={submit} noValidate className="flex flex-col gap-4 px-4 sm:px-0">
          <Field data-invalid={!!e.name || undefined}>
            <FieldLabel htmlFor="stage-name">Stage name</FieldLabel>
            <Input id="stage-name" autoComplete="off" {...register("name")} />
            <FieldError>{e.name?.message}</FieldError>
          </Field>
          <Field data-invalid={!!e.test_name || undefined}>
            <FieldLabel htmlFor="stage-test">Test</FieldLabel>
            <Input id="stage-test" autoComplete="off" {...register("test_name")} />
            <FieldDescription>Empty means the stage has no test.</FieldDescription>
            <FieldError>{e.test_name?.message}</FieldError>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field data-invalid={!!e.max_score || undefined}>
              <FieldLabel htmlFor="stage-max">Maximum score</FieldLabel>
              <Input id="stage-max" inputMode="numeric" autoComplete="off" {...register("max_score")} />
              <FieldError>{e.max_score?.message}</FieldError>
            </Field>
            <Field data-invalid={!!e.pass_mark || undefined}>
              <FieldLabel htmlFor="stage-pass">Pass mark</FieldLabel>
              <Input id="stage-pass" inputMode="numeric" autoComplete="off" {...register("pass_mark")} />
              <FieldError>{e.pass_mark?.message}</FieldError>
            </Field>
          </div>
          <ErrorAlert message={saveError} title="Stage not saved" />
        </form>
        <ResponsiveDialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="drill-stage" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Saving…" : stage ? "Save stage" : "Add stage"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
