"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";
import { kitSchema, type KitForm, type KitItem } from "@/lib/session-planner";

const EMPTY: KitForm = { name: "", quantity: 1, notes: "" };

/**
 * Add a piece of kit to the list, or change how many there are. One dialog for
 * both so the rules can't drift. The parent gives it a new `key` each time it
 * opens, so the form starts from `kit` without an effect to reset it.
 * `onSave` does the request and throws with the API's message, which is shown
 * here so the form stays filled in.
 */
export function KitDialog({
  open,
  onOpenChange,
  kit,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The kit being edited; null to add some. */
  kit: KitItem | null;
  onSave: (values: KitForm) => Promise<void>;
  /** Shown on an edit; asks for confirmation itself. */
  onDelete?: () => void;
}) {
  const form = useForm<KitForm>({
    resolver: zodResolver(kitSchema),
    defaultValues: EMPTY,
    mode: "onTouched",
  });
  const { register, handleSubmit, formState } = form;
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSave(values);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    }
  });

  const { errors } = formState;
  const usedBy = kit?.used_by ?? [];

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{kit ? `Edit ${kit.name}` : "Add kit"}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            How many the squadron has to use. Tasks only run side by side when their kit fits in this.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <form id="kit-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field data-invalid={!!errors.name || undefined}>
            <FieldLabel htmlFor="kit-name">Name</FieldLabel>
            <Input
              id="kit-name"
              autoComplete="off"
              placeholder="e.g. Plank (2 m)"
              aria-invalid={!!errors.name || undefined}
              {...register("name")}
            />
            <FieldError>{errors.name?.message}</FieldError>
          </Field>
          <Field data-invalid={!!errors.quantity || undefined}>
            <FieldLabel htmlFor="kit-quantity">How many</FieldLabel>
            <Input
              id="kit-quantity"
              type="number"
              inputMode="numeric"
              min={0}
              className="w-28"
              aria-invalid={!!errors.quantity || undefined}
              {...register("quantity", { valueAsNumber: true })}
            />
            <FieldDescription>0 if it&apos;s all broken or out on loan.</FieldDescription>
            <FieldError>{errors.quantity?.message}</FieldError>
          </Field>
          <Field data-invalid={!!errors.notes || undefined}>
            <FieldLabel htmlFor="kit-notes">Notes</FieldLabel>
            <Textarea
              id="kit-notes"
              rows={2}
              placeholder="Where it's kept, what's wrong with it"
              {...register("notes")}
            />
            <FieldError>{errors.notes?.message}</FieldError>
          </Field>
          {usedBy.length > 0 && (
            <p className="text-muted-foreground text-sm">
              Needed by{" "}
              {usedBy.map((u) => (u.quantity > 1 ? `${u.name} (${u.quantity})` : u.name)).join(", ")}.
            </p>
          )}
          <ErrorAlert message={submitError} title="Not saved" />
        </form>

        <ResponsiveDialogFooter>
          {onDelete && kit && (
            <Button
              type="button"
              variant="outline"
              className="text-destructive sm:mr-auto"
              onClick={onDelete}
            >
              Delete kit
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="kit-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Saving…" : kit ? "Save changes" : "Add kit"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
