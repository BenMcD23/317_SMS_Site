"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useSession } from "next-auth/react";

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
import { Textarea } from "@/components/ui/textarea";
import {
  badgePayload,
  badgeNames,
  badgeResolver,
  badgeToForm,
  type BadgeForm,
  type CatalogueBadge,
  EMPTY_BADGE,
  parseList,
  saveBadge,
} from "@/lib/catalogue";

/**
 * Add a badge category, or edit one. A category is either named badges ("First
 * Class", "Leading") or one badge per level ("Music – Gold"), and that choice
 * and the prefix are fixed once it exists: every order stores the full badge
 * name. Levels can be added at any time; the API refuses to remove one that
 * has been ordered, and its message is shown as it comes.
 */
function BadgeDialogBody({
  badge,
  onOpenChange,
  onSaved,
  onSetActive,
  onDelete,
}: {
  /** null = adding a new category */
  badge: CatalogueBadge | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** Retire or restore the category being edited (the page does it and closes this). */
  onSetActive: (badge: CatalogueBadge, active: boolean) => void;
  onDelete: (badge: CatalogueBadge) => void;
}) {
  const { data: session } = useSession();
  const creating = badge === null;
  const form = useForm<BadgeForm>({
    resolver: badgeResolver,
    defaultValues: badge ? badgeToForm(badge) : EMPTY_BADGE,
    mode: "onTouched",
  });
  const { control, register, handleSubmit, formState } = form;
  const [kind, name, prefix, entries] = useWatch({ control, name: ["kind", "name", "prefix", "entries"] });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const touched = (field: keyof BadgeForm) =>
    formState.touchedFields[field] ? formState.errors[field]?.message : undefined;

  const submit = handleSubmit(async (v) => {
    setSubmitError(null);
    try {
      await saveBadge(session?.id_token ?? "", badge?.id ?? null, badgePayload(v, creating));
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't save the category.");
    }
  });

  const preview = badgeNames({
    kind,
    prefix: creating ? prefix.trim() || null : badge.prefix,
    name: name.trim(),
    levels: kind === "levels" ? parseList(entries) : [],
    items: kind === "items" ? parseList(entries) : [],
  }).slice(0, 3);

  return (
    <>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>{creating ? "Add a badge category" : badge.name}</ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          {creating
            ? "It will be offered on the badge stock and order forms straight away."
            : "Badges that have been ordered can't be removed; retire the category instead."}
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>

      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-0.5">
        <Field data-invalid={!!touched("name") || undefined}>
          <FieldLabel htmlFor="badge-name">Name</FieldLabel>
          <Input id="badge-name" aria-invalid={!!touched("name") || undefined} {...register("name")} />
          <FieldError>{touched("name")}</FieldError>
        </Field>

        {creating && (
          <>
            <Field>
              <FieldLabel htmlFor="badge-kind">Made up of</FieldLabel>
              <Controller
                control={control}
                name="kind"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="badge-kind" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="levels">One badge per level (Blue, Bronze…)</SelectItem>
                      <SelectItem value="items">Named badges</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            {kind === "levels" && (
              <Field data-invalid={!!touched("prefix") || undefined}>
                <FieldLabel htmlFor="badge-prefix">Badge name starts with</FieldLabel>
                <Input id="badge-prefix" placeholder={name.trim() || "e.g. Band"} {...register("prefix")} />
                <FieldDescription>
                  Fixed once saved, because it is part of every badge’s name. Leave empty to use the category
                  name.
                </FieldDescription>
                <FieldError>{touched("prefix")}</FieldError>
              </Field>
            )}
          </>
        )}

        <Field data-invalid={!!touched("entries") || undefined}>
          <FieldLabel htmlFor="badge-entries">{kind === "items" ? "Badges" : "Levels"}</FieldLabel>
          <Textarea
            id="badge-entries"
            rows={5}
            aria-invalid={!!touched("entries") || undefined}
            {...register("entries")}
          />
          <FieldDescription>
            One per line.
            {preview.length > 0 && (
              <>
                {" "}
                Orders will read “{preview.join("”, “")}”{parseList(entries).length > 3 ? "…" : ""}.
              </>
            )}
          </FieldDescription>
          <FieldError>{touched("entries")}</FieldError>
        </Field>

        <Controller
          control={control}
          name="gainedWhere"
          render={({ field }) => (
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <label htmlFor="badge-gained" className="text-sm leading-snug font-medium">
                  Ask where it was gained
                </label>
                <p className="text-muted-foreground text-sm text-pretty">
                  Orders for these badges record whether they were earned on camp, at a weekend or on the
                  squadron.
                </p>
              </div>
              <Switch
                id="badge-gained"
                checked={field.value}
                onCheckedChange={field.onChange}
                className="mt-0.5"
              />
            </div>
          )}
        />

        <ErrorAlert message={submitError} title="Not saved" />

        {badge && (
          <div className="flex flex-col gap-2 border-t pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => onSetActive(badge, !badge.active)}>
                {badge.active ? "Retire category" : "Restore category"}
              </Button>
              {badge.inUse === 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => onDelete(badge)}
                >
                  Delete category
                </Button>
              )}
            </div>
            <p className="text-muted-foreground text-sm text-pretty">
              {badge.inUse > 0
                ? `${badge.inUse} badge orders and stock entries use these badges, so it can be retired but not deleted. A retired category leaves the forms; nothing recorded against it changes.`
                : "Not used anywhere yet, so it can be deleted."}
            </p>
          </div>
        )}
      </div>

      <ResponsiveDialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={!formState.isValid || formState.isSubmitting}>
          {creating ? "Add category" : "Save changes"}
        </Button>
      </ResponsiveDialogFooter>
    </>
  );
}

/**
 * The dialog around the form. The form lives one level down, inside the
 * content, so each time the dialog opens it mounts fresh from the entry being
 * edited: a cancelled edit or an old error never leaks into the next one.
 */
export function BadgeDialog({
  open,
  ...props
}: Omit<Parameters<typeof BadgeDialogBody>[0], never> & { open: boolean }) {
  return (
    <ResponsiveDialog open={open} onOpenChange={props.onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <BadgeDialogBody {...props} />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
