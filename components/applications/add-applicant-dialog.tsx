"use client";

import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ErrorAlert } from "@/components/error-alert";
import { ROUTE_LABEL, type Route, type UniformedApplication, addUniformed } from "@/lib/applications";

const schema = z.object({
  name: z.string().trim().min(1, "Enter their name").max(200, "200 characters at most"),
  route: z.enum(["snco", "cfc"]),
  complete: z.boolean(),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = { name: "", route: "snco", complete: false };

/**
 * Adds an adult applicant to track. They aren't on SMS until HQ appoints
 * them, so it's just their name and which route they're applying for: officer
 * (CFC) applicants also sit the Region board. Someone appointed before SMS
 * tracked it can go straight on the Complete list.
 */
export function AddApplicantDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (app: UniformedApplication) => void;
}) {
  const { data: session } = useSession();
  const { control, register, handleSubmit, reset, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  function close() {
    reset(EMPTY);
    setSubmitError(null);
    onOpenChange(false);
  }

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      onAdded(await addUniformed(session?.id_token ?? "", values.name, values.route, values.complete));
      close();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't add the applicant.");
    }
  });

  const nameError = formState.errors.name?.message;
  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && close()}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Add applicant</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Someone applying to join as uniformed staff. Officer applicants also sit the Region board.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <form id="add-applicant" onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field data-invalid={!!nameError || undefined}>
            <FieldLabel htmlFor="applicant-name">Name</FieldLabel>
            <Input
              id="applicant-name"
              autoComplete="off"
              aria-invalid={!!nameError || undefined}
              {...register("name")}
            />
            <FieldError>{nameError}</FieldError>
          </Field>
          <Field>
            <FieldLabel id="applicant-route">Applying as</FieldLabel>
            <Controller
              control={control}
              name="route"
              render={({ field }) => (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  aria-labelledby="applicant-route"
                  value={field.value}
                  // Radix sends "" when the pressed one is tapped again; keep it.
                  onValueChange={(v) => v && field.onChange(v as Route)}
                  className="w-full"
                >
                  {(Object.keys(ROUTE_LABEL) as Route[]).map((r) => (
                    <ToggleGroupItem key={r} value={r} className="h-9 flex-1">
                      {ROUTE_LABEL[r]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            />
          </Field>
          <Controller
            control={control}
            name="complete"
            render={({ field }) => (
              <Field orientation="horizontal">
                <Checkbox
                  id="applicant-complete"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
                <FieldContent>
                  <FieldLabel htmlFor="applicant-complete">Already complete</FieldLabel>
                  <FieldDescription>
                    Goes straight on the Complete list, with no steps ticked.
                  </FieldDescription>
                </FieldContent>
              </Field>
            )}
          />
          <ErrorAlert message={submitError} title="Applicant not added" />
        </form>

        <ResponsiveDialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="add-applicant" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Adding…" : "Add applicant"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
