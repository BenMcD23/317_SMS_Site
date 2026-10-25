"use client";

import { useState } from "react";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { ErrorAlert } from "@/components/error-alert";
import { addRecruit, type NewRecruit, type Recruit } from "@/lib/recruits";

const required = (what: string) => z.string().trim().min(1, `Enter the ${what}`).max(200, "Too long");

const schema = z.object({
  cadetFirstName: required("cadet's first name"),
  cadetLastName: required("cadet's last name"),
  parentName: required("parent's name"),
  parentEmail: z.string().trim().email("Enter an email address, like name@example.com"),
});

const EMPTY: NewRecruit = { cadetFirstName: "", cadetLastName: "", parentName: "", parentEmail: "" };

const FIELDS: { name: keyof NewRecruit; label: string; type?: string; autoComplete: string }[] = [
  { name: "cadetFirstName", label: "Cadet's first name", autoComplete: "off" },
  { name: "cadetLastName", label: "Cadet's last name", autoComplete: "off" },
  { name: "parentName", label: "Parent or guardian's name", autoComplete: "off" },
  { name: "parentEmail", label: "Parent or guardian's email", type: "email", autoComplete: "off" },
];

/**
 * Adds a recruit and hands back their joining-form link. Staff then send the
 * link to the parent themselves, so the dialog's job ends at "here's the link".
 */
export function AddRecruitDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (recruit: Recruit) => void;
}) {
  const { data: session } = useSession();
  const form = useForm<NewRecruit>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
    mode: "onTouched",
  });
  const { register, handleSubmit, reset, formState } = form;
  const [submitError, setSubmitError] = useState<string | null>(null);

  function close() {
    reset(EMPTY);
    setSubmitError(null);
    onOpenChange(false);
  }

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      const recruit = await addRecruit(session?.id_token ?? "", values);
      onAdded(recruit);
      close();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't add the recruit.");
    }
  });

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && close()}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Add recruit</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            You&apos;ll get a link to send the parent. It works for 14 days.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <form id="add-recruit" onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {FIELDS.map(({ name, label, type, autoComplete }) => {
            const error = formState.errors[name]?.message;
            return (
              <Field key={name} data-invalid={!!error || undefined}>
                <FieldLabel htmlFor={`recruit-${name}`}>{label}</FieldLabel>
                <Input
                  id={`recruit-${name}`}
                  type={type ?? "text"}
                  autoComplete={autoComplete}
                  aria-invalid={!!error || undefined}
                  {...register(name)}
                />
                <FieldError>{error}</FieldError>
              </Field>
            );
          })}
          <ErrorAlert message={submitError} title="Recruit not added" />
        </form>

        <ResponsiveDialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="add-recruit" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Adding…" : "Add recruit"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
