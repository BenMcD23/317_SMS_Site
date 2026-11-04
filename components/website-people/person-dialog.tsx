"use client";

import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorAlert } from "@/components/error-alert";
import {
  MAX_NAME_LENGTH,
  OWN_RANK,
  displayName,
  formFromPerson,
  personSchema,
  photoUrl,
  type PeopleGroup,
  type PersonForm,
  type WebsitePerson,
} from "@/lib/website-people";

/**
 * Add someone to the website's staff or NCO page, or edit them (a promotion,
 * a new photo). One dialog for both so the fields and their rules can't drift.
 * Fields sit outside a `<form>`: inside one, Radix Select adds a hidden native
 * select that echoes values back (see `StockItemFields`).
 *
 * `onSave` does the request and throws with the API's message on failure,
 * which is shown here so the form stays filled in for another try.
 */
export function PersonDialog({
  open,
  onOpenChange,
  group,
  ranks,
  person,
  onSave,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: PeopleGroup;
  /** The ranks the website lists for this group, highest first. */
  ranks: string[];
  /** Who's being edited; null to add someone. */
  person: WebsitePerson | null;
  onSave: (values: PersonForm) => Promise<void>;
  /** Shown on an edit; asks for confirmation itself. */
  onRemove?: () => void;
}) {
  const adding = person === null;
  const form = useForm<PersonForm>({
    resolver: zodResolver(personSchema(group, adding)),
    defaultValues: formFromPerson(person),
    mode: "onChange",
  });
  const { control, register, handleSubmit, reset, formState } = form;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const picked = useWatch({ control, name: "photo" });

  useEffect(() => {
    if (open) {
      reset(formFromPerson(person));
      setSubmitError(null);
    }
  }, [open, person, reset]);

  // A preview of the photo just picked; revoked when it changes or closes.
  const pickedUrl = useMemo(() => (picked ? URL.createObjectURL(picked) : null), [picked]);
  useEffect(() => () => void (pickedUrl && URL.revokeObjectURL(pickedUrl)), [pickedUrl]);
  const preview = pickedUrl ?? (person ? photoUrl(group, person.image) : null);

  const errorFor = (name: keyof PersonForm) =>
    formState.touchedFields[name] || formState.isSubmitted ? formState.errors[name]?.message : undefined;

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSave(values);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    }
  });

  const who = group === "staff" ? "staff" : "NCO";
  const photoError = errorFor("photo");
  const nameError = errorFor("name");
  const rankError = errorFor("rank");

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {person ? `Edit ${displayName(person)}` : `Add ${who}`}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Shown on the website&apos;s {group === "staff" ? "Our Staff" : "Our NCOs"} page, sorted by rank.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-4">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- a local object URL or GitHub raw file, not an optimisable asset
              <img
                src={preview}
                alt={picked ? "New photo" : `Current photo of ${person ? displayName(person) : ""}`}
                className="bg-muted aspect-3/4 w-20 shrink-0 rounded-md border object-cover object-top"
              />
            ) : (
              <div className="bg-muted aspect-3/4 w-20 shrink-0 rounded-md border" aria-hidden />
            )}
            <Field data-invalid={!!photoError || undefined}>
              <FieldLabel htmlFor="person-photo">{adding ? "Photo" : "New photo"}</FieldLabel>
              <Controller
                control={control}
                name="photo"
                render={({ field }) => (
                  <Input
                    id="person-photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    aria-invalid={!!photoError || undefined}
                    onBlur={field.onBlur}
                    onChange={(e) => field.onChange(e.target.files?.[0] ?? null)}
                  />
                )}
              />
              <FieldDescription>
                {adding
                  ? group === "staff"
                    ? "Portrait, head and shoulders. Leave it empty to use the placeholder for now."
                    : "Portrait, head and shoulders."
                  : "Leave it empty to keep the current photo."}
              </FieldDescription>
              <FieldError>{photoError}</FieldError>
            </Field>
          </div>

          <Field data-invalid={!!rankError || undefined}>
            <FieldLabel htmlFor="person-rank">Rank</FieldLabel>
            <Controller
              control={control}
              name="rank"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v);
                    field.onBlur();
                  }}
                >
                  <SelectTrigger id="person-rank" className="w-full" aria-invalid={!!rankError || undefined}>
                    <SelectValue placeholder="Select a rank" />
                  </SelectTrigger>
                  <SelectContent>
                    {ranks
                      // "Wg Cdr (Ret'd)" is a place to list someone, not a rank they hold.
                      .filter((r) => !r.includes("Ret'd"))
                      .map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError>{rankError}</FieldError>
          </Field>

          <Field data-invalid={!!nameError || undefined}>
            <FieldLabel htmlFor="person-name">Name</FieldLabel>
            <Input
              id="person-name"
              maxLength={MAX_NAME_LENGTH}
              autoComplete="off"
              placeholder={group === "staff" ? "e.g. Simon Doherty" : "e.g. C Mack"}
              aria-invalid={!!nameError || undefined}
              {...register("name")}
            />
            <FieldDescription>
              {group === "staff"
                ? "First name and surname."
                : "First initial and surname, as the page shows them."}
            </FieldDescription>
            <FieldError>{nameError}</FieldError>
          </Field>

          {group === "staff" && (
            <Field>
              <FieldLabel htmlFor="person-sort-as">List under</FieldLabel>
              <Controller
                control={control}
                name="sortAs"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="person-sort-as" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={OWN_RANK}>Their own rank</SelectItem>
                      {ranks.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldDescription>
                For someone whose place isn&apos;t their rank, like a retired officer serving as a CI.
              </FieldDescription>
            </Field>
          )}

          <ErrorAlert message={submitError} title="Not saved" />
        </div>

        <ResponsiveDialogFooter>
          {onRemove && !adding && (
            // mr-auto puts it apart from Save on a laptop; in the sheet it
            // stacks first, furthest from the thumb.
            <Button
              type="button"
              variant="outline"
              className="text-destructive sm:mr-auto"
              onClick={onRemove}
            >
              Remove from website
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Publishing…" : adding ? `Add ${who}` : "Save changes"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
