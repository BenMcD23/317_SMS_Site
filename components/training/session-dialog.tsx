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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { flightLabel } from "@/lib/cadet-format";
import { categoriesOf } from "@/lib/theory";
import {
  GROUPING_LABELS,
  GROUPINGS,
  HALVES,
  lessonName,
  periodLabel,
  POOL_LABELS,
  POOLS,
  sessionFormFrom,
  sessionSchema,
  type CatalogueSubject,
  type NightSession,
  type SessionForm,
} from "@/lib/training";

// Radix Select can't hold an empty value, so "none" stands for it in the menus.
const NONE = "none";

const GROUPING_HINTS = {
  one: "Everyone together.",
  flight: "A group per flight.",
  need: "Who needs the lesson, who's missing an earlier one, and who's had it.",
  mixed: "Dealt evenly, so each group gets a share of the NCOs and of each flight.",
} as const;

/**
 * Add a session to a night or change one: what it is, the lesson it teaches
 * (if any), who it's for and how to group them. Each session carries its own
 * inputs, so one night can mix a lesson grouped by need with drill by flight.
 * Fields sit outside a `<form>`: inside one, Radix Select adds a hidden native
 * select that echoes values back (see `StockItemFields`). The parent gives it
 * a new `key` each time it opens, so it starts from `session`.
 */
export function SessionDialog({
  open,
  onOpenChange,
  session,
  subjects,
  flights,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The session being changed; null to add one. */
  session: NightSession | null;
  subjects: CatalogueSubject[];
  /** The squadron's flights, for "who it's for". */
  flights: string[];
  onSave: (values: SessionForm) => Promise<void>;
  onDelete?: () => void;
}) {
  const form = useForm<SessionForm>({
    resolver: zodResolver(sessionSchema),
    defaultValues: sessionFormFrom(session),
    mode: "onTouched",
  });
  const { control, register, handleSubmit, formState, setValue } = form;
  const lesson = useWatch({ control, name: "lesson" });
  const grouping = useWatch({ control, name: "grouping" });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const errorFor = (name: keyof SessionForm) =>
    formState.touchedFields[name] || formState.isSubmitted ? formState.errors[name]?.message : undefined;

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSave(values);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    }
  });

  const titleError = errorFor("title");
  const groupingError = formState.errors.grouping?.message;
  const needError = formState.errors.needOnly?.message;
  const countError = errorFor("groupCount");
  const maxError = errorFor("maxGroup");

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{session ? `Change ${session.title}` : "Add session"}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            The groups are worked out from who&apos;s checked in, and who has scanned the lesson&apos;s QR
            code, each time the page refreshes.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_13rem]">
            <Field data-invalid={!!titleError || undefined}>
              <FieldLabel htmlFor="session-title">Name</FieldLabel>
              <Input
                id="session-title"
                autoComplete="off"
                placeholder="e.g. Map Reading 2"
                aria-invalid={!!titleError || undefined}
                {...register("title")}
              />
              <FieldError>{titleError}</FieldError>
            </Field>
            <Controller
              control={control}
              name="period"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="session-period">When</FieldLabel>
                  <Select
                    value={field.value || NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
                  >
                    <SelectTrigger id="session-period" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HALVES.map((h) => (
                        <SelectItem key={h.period} value={String(h.period)}>
                          {periodLabel(h.period)}
                        </SelectItem>
                      ))}
                      <SelectItem value={NONE}>{periodLabel(null)}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
          </div>

          <Controller
            control={control}
            name="lesson"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="session-lesson">Lesson</FieldLabel>
                <Select
                  value={field.value || NONE}
                  onValueChange={(v) => {
                    const next = v === NONE ? "" : v;
                    field.onChange(next);
                    // Without a lesson there's no "need" to group or filter by.
                    if (!next) {
                      setValue("needOnly", false);
                      if (grouping === "need") setValue("grouping", "one");
                    }
                  }}
                >
                  <SelectTrigger id="session-lesson" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not a lesson (drill, sport, anything else)</SelectItem>
                    {categoriesOf(subjects).map((category) => (
                      <SelectGroup key={category}>
                        <SelectLabel>{category}</SelectLabel>
                        {subjects
                          .filter((s) => s.category === category)
                          .flatMap((s) =>
                            Array.from({ length: s.parts }, (_, i) => (
                              <SelectItem key={`${s.key}:${i + 1}`} value={`${s.key}:${i + 1}`}>
                                {lessonName(s.name, i + 1, s.parts)}
                              </SelectItem>
                            ))
                          )}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Cadets record a lesson by scanning its QR code. Add new subjects on the QR codes tab.
                </FieldDescription>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="flights"
            render={({ field }) => (
              <Field>
                <FieldLabel id="session-flights-label">Flights</FieldLabel>
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  size="sm"
                  aria-labelledby="session-flights-label"
                  className="flex-wrap justify-start"
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  {flights.map((f) => (
                    <ToggleGroupItem key={f} value={f} className="px-3">
                      {f.length === 1 ? flightLabel(f) : f}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <FieldDescription>
                  {field.value.length === 0 ? "None picked: every flight." : "Only cadets in these flights."}
                </FieldDescription>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="pool"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="session-pool">Plan with</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="session-pool" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POOLS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {POOL_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="needOnly"
            render={({ field }) => (
              <Field orientation="horizontal" data-invalid={!!needError || undefined}>
                <Switch
                  id="session-need-only"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={!lesson}
                />
                <div className="flex flex-col gap-0.5">
                  <FieldLabel htmlFor="session-need-only">Only cadets who still need it</FieldLabel>
                  <FieldDescription>
                    In a period with other sessions, it picks its cadets first and the rest go to the others.
                  </FieldDescription>
                  <FieldError>{needError}</FieldError>
                </div>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="grouping"
            render={({ field }) => (
              <Field data-invalid={!!groupingError || undefined}>
                <FieldLabel id="session-grouping-label">Groups</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  aria-labelledby="session-grouping-label"
                  className="flex-wrap justify-start"
                  value={field.value}
                  // Radix sends "" when the pressed item is pressed again; keep it.
                  onValueChange={(v) => v && field.onChange(v)}
                >
                  {GROUPINGS.map((g) => (
                    <ToggleGroupItem key={g} value={g} className="px-3" disabled={g === "need" && !lesson}>
                      {GROUPING_LABELS[g]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <FieldDescription>{GROUPING_HINTS[field.value]}</FieldDescription>
                <FieldError>{groupingError}</FieldError>
              </Field>
            )}
          />

          <div className="grid grid-cols-2 gap-3">
            {grouping === "mixed" && (
              <Field data-invalid={!!countError || undefined}>
                <FieldLabel htmlFor="session-group-count">How many groups</FieldLabel>
                <Input
                  id="session-group-count"
                  inputMode="numeric"
                  placeholder="2"
                  aria-invalid={!!countError || undefined}
                  {...register("groupCount")}
                />
                <FieldError>{countError}</FieldError>
              </Field>
            )}
            <Field data-invalid={!!maxError || undefined}>
              <FieldLabel htmlFor="session-max-group">Largest group</FieldLabel>
              <Input
                id="session-max-group"
                inputMode="numeric"
                placeholder="No limit"
                aria-invalid={!!maxError || undefined}
                {...register("maxGroup")}
              />
              <FieldError>{maxError}</FieldError>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="session-instructor">Who&apos;s running it</FieldLabel>
            <Input
              id="session-instructor"
              autoComplete="off"
              placeholder="e.g. Sgt Davies"
              {...register("instructor")}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="session-notes">Notes</FieldLabel>
            <Textarea
              id="session-notes"
              rows={2}
              placeholder="Where, kit, anything else"
              {...register("notes")}
            />
          </Field>

          <ErrorAlert message={submitError} title="Not saved" />
        </div>

        <ResponsiveDialogFooter>
          {onDelete && session && (
            <Button
              type="button"
              variant="outline"
              className="text-destructive sm:mr-auto"
              onClick={onDelete}
            >
              Delete session
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Saving…" : session ? "Save changes" : "Add session"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
