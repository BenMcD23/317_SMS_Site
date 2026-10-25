"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CadetSearchInput } from "@/components/cadet-search";
import { ErrorAlert } from "@/components/error-alert";
import { LEVELS, switchOn, type CadetActivityLog, type Level } from "@/lib/activity-logs";

const schema = z.object({
  cin: z.number({ error: "Choose a cadet" }).int().positive("Choose a cadet"),
  name: z.string(),
  level: z.enum(["Bronze", "Silver", "Gold"]),
});
type Values = z.infer<typeof schema>;

const EMPTY = { cin: undefined as unknown as number, name: "", level: "Bronze" as Level };

/**
 * Switches a cadet's activity log on, which is what makes the Activity Log
 * page appear on their cadet portal. Also how a level is changed: switching
 * on a cadet who's already on just updates it.
 */
export function SwitchOnDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (log: CadetActivityLog) => void;
}) {
  const { data: session } = useSession();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const { control, handleSubmit, reset, formState, setValue } = form;
  const [cin, name] = useWatch({ control, name: ["cin", "name"] });
  const [submitError, setSubmitError] = useState<string | null>(null);

  function close() {
    reset(EMPTY);
    setSubmitError(null);
    onOpenChange(false);
  }

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      onDone(await switchOn(session?.id_token ?? "", values.cin, values.level));
      close();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't switch the DofE activity log on.");
    }
  });

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && close()}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Switch on a DofE activity log</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            The cadet sees a DofE Activity Log page on the cadet portal from their next visit.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <form id="switch-on" onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field data-invalid={!!formState.errors.cin || undefined}>
            <FieldLabel>Cadet</FieldLabel>
            <CadetSearchInput
              token={session?.id_token ?? null}
              selectedCin={cin ?? null}
              selectedName={name}
              onSelect={(cin, name) => {
                setValue("cin", cin, { shouldValidate: formState.isSubmitted });
                setValue("name", name);
              }}
            />
            <FieldError>{formState.errors.cin?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel id="switch-on-level">Level</FieldLabel>
            <Controller
              control={control}
              name="level"
              render={({ field }) => (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  aria-labelledby="switch-on-level"
                  value={field.value}
                  // Radix sends "" when the pressed one is tapped again; keep it.
                  onValueChange={(v) => v && field.onChange(v)}
                  className="w-full"
                >
                  {LEVELS.map((l) => (
                    <ToggleGroupItem key={l} value={l} className="h-9 flex-1">
                      {l}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            />
          </Field>
          <ErrorAlert message={submitError} title="Not switched on" />
        </form>

        <ResponsiveDialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="switch-on" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Switching on…" : "Switch on"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
