"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "next-auth/react";
import { z } from "zod";

import { ErrorAlert } from "@/components/error-alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { recordAttempt, type DrillAttempt, type DrillStage } from "@/lib/drill";
import { todayLocal } from "@/lib/format";

type Values = { tested_on: string; score: string; result: "" | "pass" | "fail"; notes: string };

/** The rules the API enforces (routers/drill.py), checked before the round trip. */
export function attemptSchema(stage: DrillStage, today: string) {
  return z
    .object({
      tested_on: z
        .string()
        .min(1, "Pick the date")
        .refine((d) => d <= today, "The test date can't be in the future"),
      score: z.string().trim(),
      result: z.enum(["", "pass", "fail"]),
      notes: z.string().max(1000, "Keep it under 1000 characters"),
    })
    .superRefine((v, ctx) => {
      if (v.score !== "") {
        const n = Number(v.score);
        const max = stage.max_score;
        if (!Number.isInteger(n) || n < 0 || (max !== null && n > max)) {
          ctx.addIssue({
            code: "custom",
            path: ["score"],
            message: max !== null ? `A whole number from 0 to ${max}` : "A whole number, 0 or more",
          });
        }
      } else if (stage.pass_mark !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["score"],
          message: `Enter the score: the pass mark is ${stage.pass_mark}`,
        });
      }
      if (stage.pass_mark === null && v.result === "") {
        ctx.addIssue({ code: "custom", path: ["result"], message: "Pick pass or fail" });
      }
    });
}

/**
 * Records one attempt at a stage's test. With a pass mark the score decides,
 * so there is no pass/fail to pick (the API would overrule it anyway);
 * without one the tester says.
 */
export function AttemptForm({
  cin,
  stage,
  onSaved,
  onCancel,
}: {
  cin: number;
  stage: DrillStage;
  onSaved: (attempt: DrillAttempt) => void;
  onCancel: () => void;
}) {
  const { data: session } = useSession();
  const today = todayLocal();
  const { register, handleSubmit, control, formState } = useForm<Values>({
    resolver: zodResolver(attemptSchema(stage, today)),
    defaultValues: { tested_on: today, score: "", result: "", notes: "" },
    mode: "onTouched",
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const id = (name: string) => `attempt-${stage.id}-${name}`;

  const submit = handleSubmit(async (v) => {
    setSaveError(null);
    try {
      const attempt = await recordAttempt(session?.id_token ?? "", cin, {
        stage_id: stage.id,
        tested_on: v.tested_on,
        score: v.score === "" ? null : Number(v.score),
        passed: stage.pass_mark === null ? v.result === "pass" : null,
        notes: v.notes.trim() || null,
      });
      onSaved(attempt);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save the test.");
    }
  });

  const e = formState.errors;
  return (
    <form onSubmit={submit} noValidate className="bg-muted/40 flex flex-col gap-3 rounded-md border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field data-invalid={!!e.tested_on || undefined}>
          <FieldLabel htmlFor={id("date")}>Date tested</FieldLabel>
          <Input id={id("date")} type="date" max={today} {...register("tested_on")} />
          <FieldError>{e.tested_on?.message}</FieldError>
        </Field>
        <Field data-invalid={!!e.score || undefined}>
          <FieldLabel htmlFor={id("score")}>
            Score{stage.max_score !== null ? ` out of ${stage.max_score}` : ""}
          </FieldLabel>
          <Input id={id("score")} inputMode="numeric" autoComplete="off" {...register("score")} />
          {stage.pass_mark !== null && <FieldDescription>Pass mark {stage.pass_mark}</FieldDescription>}
          <FieldError>{e.score?.message}</FieldError>
        </Field>
      </div>
      {stage.pass_mark === null && (
        <Field data-invalid={!!e.result || undefined}>
          <FieldLabel id={id("result")}>Result</FieldLabel>
          <Controller
            control={control}
            name="result"
            render={({ field }) => (
              <ToggleGroup
                type="single"
                variant="outline"
                aria-labelledby={id("result")}
                value={field.value}
                onValueChange={(v) => v && field.onChange(v)}
                className="w-fit"
              >
                <ToggleGroupItem value="pass" className="h-9 px-4">
                  Pass
                </ToggleGroupItem>
                <ToggleGroupItem value="fail" className="h-9 px-4">
                  Not yet
                </ToggleGroupItem>
              </ToggleGroup>
            )}
          />
          <FieldError>{e.result?.message}</FieldError>
        </Field>
      )}
      <Field data-invalid={!!e.notes || undefined}>
        <FieldLabel htmlFor={id("notes")}>Notes (optional)</FieldLabel>
        <Textarea id={id("notes")} rows={2} placeholder="What to work on" {...register("notes")} />
        <FieldError>{e.notes?.message}</FieldError>
      </Field>
      <ErrorAlert message={saveError} title="Test not saved" />
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" className="h-9" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="h-9" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Saving…" : `Save ${stage.test_name ?? "test"}`}
        </Button>
      </div>
    </form>
  );
}
