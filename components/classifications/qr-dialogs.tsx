"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

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
import {
  sectionSchema,
  subjectSchema,
  type CustomSubject,
  type SectionForm,
  type SubjectForm,
  type TheorySection,
} from "@/lib/theory";

/**
 * Add a section to the QR codes page, or rename one staff added. The parent
 * gives it a new `key` each time it opens, so it starts from `section`.
 */
export function SectionDialog({
  open,
  onOpenChange,
  section,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: TheorySection | null;
  onSave: (values: SectionForm) => Promise<void>;
  /** Offered for an empty section; asks for confirmation itself. */
  onDelete?: () => void;
}) {
  const form = useForm<SectionForm>({
    resolver: zodResolver(sectionSchema),
    defaultValues: { name: section?.name ?? "" },
    mode: "onTouched",
  });
  const { register, handleSubmit, formState } = form;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const error = formState.errors.name?.message;

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSave(values);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    }
  });

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{section ? `Rename ${section.name}` : "Add section"}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            A heading for QR codes that aren&apos;t badge theory or the classification syllabus, like a course
            the squadron runs.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <form id="section-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="section-name">Name</FieldLabel>
            <Input
              id="section-name"
              autoComplete="off"
              placeholder="e.g. Fieldcraft"
              aria-invalid={!!error || undefined}
              {...register("name")}
            />
            <FieldError>{error}</FieldError>
          </Field>
          <ErrorAlert message={submitError} title="Not saved" />
        </form>
        <ResponsiveDialogFooter>
          {onDelete && section && section.subjects === 0 && (
            <Button
              type="button"
              variant="outline"
              className="text-destructive sm:mr-auto"
              onClick={onDelete}
            >
              Delete section
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="section-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Saving…" : section ? "Save name" : "Add section"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

/**
 * Add a set of lesson QR codes (a subject) or edit one staff added. Each
 * lesson gets a code that never changes. Lessons can be added but never taken
 * away, since their codes may be on slides; a subject cadets have been
 * recorded on can be retired (its codes stop working) but not deleted.
 * Fields sit outside a `<form>`: inside one, Radix Select adds a hidden native
 * select that echoes values back (see `StockItemFields`).
 */
export function SubjectDialog({
  open,
  onOpenChange,
  subject,
  sections,
  defaultSection,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: CustomSubject | null;
  /** Sections subjects can go in. */
  sections: TheorySection[];
  defaultSection?: string;
  onSave: (values: SubjectForm) => Promise<void>;
  onDelete?: () => void;
}) {
  const minLessons = subject?.parts ?? 1;
  const form = useForm<SubjectForm>({
    resolver: zodResolver(subjectSchema(minLessons)),
    defaultValues: {
      name: subject?.name ?? "",
      section: subject?.category ?? defaultSection ?? sections[0]?.name ?? "",
      parts: subject?.parts ?? 1,
      active: subject?.active ?? true,
    },
    mode: "onTouched",
  });
  const { control, register, handleSubmit, formState } = form;
  const active = useWatch({ control, name: "active" });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const errorFor = (name: keyof SubjectForm) =>
    formState.touchedFields[name] || formState.isSubmitted ? formState.errors[name]?.message : undefined;

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSave(values);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    }
  });

  const nameError = errorFor("name");
  const partsError = errorFor("parts");
  const sectionError = errorFor("section");

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{subject ? `Edit ${subject.name}` : "Add QR codes"}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            One code per lesson, for cadets to scan in. Codes never change once made, so they can go on slides
            straight away.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="flex flex-col gap-4">
          <Field data-invalid={!!nameError || undefined}>
            <FieldLabel htmlFor="subject-name">What&apos;s taught</FieldLabel>
            <Input
              id="subject-name"
              autoComplete="off"
              placeholder="e.g. Shelter Building"
              aria-invalid={!!nameError || undefined}
              {...register("name")}
            />
            <FieldError>{nameError}</FieldError>
          </Field>

          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <Controller
              control={control}
              name="section"
              render={({ field }) => (
                <Field data-invalid={!!sectionError || undefined}>
                  <FieldLabel htmlFor="subject-section">Section</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="subject-section" className="w-full">
                      <SelectValue placeholder="Choose a section" />
                    </SelectTrigger>
                    <SelectContent>
                      {sections.map((s) => (
                        <SelectItem key={s.name} value={s.name}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError>{sectionError}</FieldError>
                </Field>
              )}
            />
            <Field data-invalid={!!partsError || undefined}>
              <FieldLabel htmlFor="subject-parts">Lessons</FieldLabel>
              <Input
                id="subject-parts"
                type="number"
                inputMode="numeric"
                min={minLessons}
                aria-invalid={!!partsError || undefined}
                {...register("parts", { valueAsNumber: true })}
              />
            </Field>
          </div>
          <FieldError className="-mt-2">{partsError}</FieldError>
          {subject && (
            <FieldDescription className="-mt-2">
              Lessons can be added; the {subject.parts} that exist keep their codes.
            </FieldDescription>
          )}

          {subject && (
            <Controller
              control={control}
              name="active"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Switch id="subject-active" checked={field.value} onCheckedChange={field.onChange} />
                  <FieldLabel htmlFor="subject-active">In use</FieldLabel>
                </Field>
              )}
            />
          )}
          {subject && !active && (
            <p className="text-muted-foreground -mt-2 text-sm">
              Retired: its codes stop working and it leaves the page. Turn it back on and the same codes work
              again.
            </p>
          )}

          <ErrorAlert message={submitError} title="Not saved" />
        </div>

        <ResponsiveDialogFooter>
          {onDelete && subject && !subject.used && (
            <Button
              type="button"
              variant="outline"
              className="text-destructive sm:mr-auto"
              onClick={onDelete}
            >
              Delete
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Saving…" : subject ? "Save changes" : "Make codes"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
