"use client";

import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MessageSquarePlus } from "lucide-react";

import { ErrorAlert } from "@317/ui-common/components/error-alert";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@317/ui-common/components/responsive-dialog";
import { Button } from "@317/ui-common/components/ui/button";
import { Input } from "@317/ui-common/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@317/ui-common/components/ui/select";
import { Textarea } from "@317/ui-common/components/ui/textarea";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  categoryLabel,
  nightLabel,
  periodLabel,
  pickableKinds,
  slotFormFrom,
  slotSchema,
  whoLabel,
  type Person,
  type Programme,
  type Slot,
  type SlotForm,
} from "@/lib/programme-builder";
import { PeoplePicker } from "@/components/programme-builder/people-picker";
import { useKinds } from "@/components/programme-builder/use-programme";
import { NewKindDialog, NewLink, NewRoomDialog } from "@/components/programme-builder/month-dialogs";

const NONE = "none";

/** Who else is on something in the same half that night: key → what. */
export function busyPeople(
  programme: Programme,
  nightId: number,
  period: "1" | "2" | "all",
  except?: number
) {
  const night = programme.nights.find((n) => n.id === nightId);
  const busy = new Map<string, string>();
  for (const s of night?.slots ?? []) {
    if (s.id === except) continue;
    const overlaps = period === "all" || s.period === null || String(s.period) === period;
    if (!overlaps) continue;
    for (const p of s.people) busy.set(p.key, `On ${s.title}`);
  }
  return busy;
}

/**
 * Add a session or change one: what, when, for whom, where and who. Fields
 * sit outside a `<form>` (Radix Select inside one echoes values back, see
 * `StockItemFields`). The parent gives it a new `key` each time it opens.
 * Editing also offers copying it to other nights, the quick way to run the
 * same thing weekly.
 */
export function SlotDialog({
  open,
  onOpenChange,
  programme,
  slot,
  start,
  people,
  onSave,
  onDelete,
  onCopy,
  onComment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programme: Programme;
  /** The session being changed; null to add one. */
  slot: Slot | null;
  /** Where a new session goes, and anything from the bank. */
  start?: Partial<SlotForm>;
  people: Person[];
  onSave: (values: SlotForm) => Promise<void>;
  onDelete?: () => void;
  onCopy?: (nightIds: number[]) => Promise<boolean>;
  onComment?: () => void;
}) {
  const form = useForm<SlotForm>({
    resolver: zodResolver(slotSchema),
    defaultValues: slotFormFrom(slot, start),
    mode: "onTouched",
  });
  const { control, register, handleSubmit, formState } = form;
  const nightId = useWatch({ control, name: "nightId" });
  const period = useWatch({ control, name: "period" });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copyTo, setCopyTo] = useState<string[]>([]);
  const [copying, setCopying] = useState(false);
  const kinds = useKinds();
  const [adding, setAdding] = useState<"kind" | "room" | null>(null);

  const night = programme.nights.find((n) => n.id === nightId);
  const busy = useMemo(
    () => busyPeople(programme, nightId, period, slot?.id),
    [programme, nightId, period, slot]
  );
  const busyRooms = useMemo(() => {
    const rooms = new Map<number, string>();
    for (const s of night?.slots ?? []) {
      if (s.id === slot?.id || !s.room_id) continue;
      if (period === "all" || s.period === null || String(s.period) === period) rooms.set(s.room_id, s.title);
    }
    return rooms;
  }, [night, period, slot]);
  const flights = programme.flights.map((f) => f.key);

  const errorFor = (name: keyof SlotForm) =>
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

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-xl">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{slot ? `Change ${slot.title}` : "Add session"}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {slot
              ? `${nightLabel(night?.date ?? "")} · ${periodLabel(slot.period)} · ${whoLabel(slot.flights, flights)}`
              : "Pick the night, the half and the flights. No flights picked is everyone."}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
            <Field data-invalid={!!titleError || undefined}>
              <FieldLabel htmlFor="slot-title">Name</FieldLabel>
              <Input
                id="slot-title"
                autoComplete="off"
                placeholder="e.g. Map Reading 2"
                aria-invalid={!!titleError || undefined}
                {...register("title")}
              />
              <FieldError>{titleError}</FieldError>
            </Field>
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="slot-category">Kind</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="slot-category" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {pickableKinds(kinds, field.value).map((c) => (
                        <SelectItem key={c.key} value={c.key}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <NewLink onClick={() => setAdding("kind")}>New kind</NewLink>
                  <NewKindDialog
                    open={adding === "kind"}
                    onOpenChange={(o) => !o && setAdding(null)}
                    onCreated={field.onChange}
                  />
                </Field>
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="nightId"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="slot-night">Night</FieldLabel>
                  <Select value={String(field.value ?? "")} onValueChange={(v) => field.onChange(Number(v))}>
                    <SelectTrigger id="slot-night" className="w-full">
                      <SelectValue placeholder="Pick a night" />
                    </SelectTrigger>
                    <SelectContent>
                      {programme.nights.map((n) => (
                        <SelectItem key={n.id} value={String(n.id)}>
                          {nightLabel(n.date)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError>{errorFor("nightId")}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="period"
              render={({ field }) => (
                <Field>
                  <FieldLabel id="slot-period-label">Half</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    aria-labelledby="slot-period-label"
                    value={field.value}
                    onValueChange={(v) => v && field.onChange(v)}
                    className="w-full"
                  >
                    <ToggleGroupItem value="1" className="flex-1">
                      1st
                    </ToggleGroupItem>
                    <ToggleGroupItem value="2" className="flex-1">
                      2nd
                    </ToggleGroupItem>
                    <ToggleGroupItem value="all" className="flex-1">
                      All night
                    </ToggleGroupItem>
                  </ToggleGroup>
                </Field>
              )}
            />
          </div>

          <Controller
            control={control}
            name="flights"
            render={({ field }) => (
              <Field>
                <FieldLabel id="slot-flights-label">Flights</FieldLabel>
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  aria-labelledby="slot-flights-label"
                  value={field.value}
                  onValueChange={(v) => field.onChange(flights.filter((f) => v.includes(f)))}
                  className="self-start"
                >
                  {programme.flights.map((f) => (
                    <ToggleGroupItem key={f.key} value={f.key} aria-label={f.label} className="px-4">
                      {f.key}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <FieldDescription>
                  {field.value.length ? whoLabel(field.value, flights) : "None picked: the whole squadron."}
                </FieldDescription>
              </Field>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="roomId"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="slot-room">Room</FieldLabel>
                  <Select
                    value={field.value || NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
                  >
                    <SelectTrigger id="slot-room" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No room yet</SelectItem>
                      {programme.rooms
                        .filter((r) => r.active || String(r.id) === field.value)
                        .map((r) => (
                          <SelectItem key={r.id} value={String(r.id)}>
                            {r.name}
                            {r.capacity ? ` (${r.capacity})` : ""}
                            {busyRooms.has(r.id) ? ` · in use for ${busyRooms.get(r.id)}` : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <NewLink onClick={() => setAdding("room")}>New room</NewLink>
                  <NewRoomDialog
                    open={adding === "room"}
                    onOpenChange={(o) => !o && setAdding(null)}
                    onCreated={(id) => field.onChange(String(id))}
                  />
                </Field>
              )}
            />
            <Field>
              <FieldLabel htmlFor="slot-instructor">Running it</FieldLabel>
              <Input
                id="slot-instructor"
                autoComplete="off"
                placeholder="e.g. Flight NCOs, or a guest"
                {...register("instructor")}
              />
              <FieldError>{errorFor("instructor")}</FieldError>
            </Field>
          </div>

          <Controller
            control={control}
            name="people"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="slot-people">People on it</FieldLabel>
                <PeoplePicker
                  id="slot-people"
                  people={people}
                  value={field.value}
                  onChange={field.onChange}
                  date={night?.date ?? null}
                  busy={busy}
                />
                <FieldDescription>
                  Staff and NCOs running it, or cadets taken out of their flight for it.
                </FieldDescription>
                <FieldError>{errorFor("people")}</FieldError>
              </Field>
            )}
          />

          <Field>
            <FieldLabel htmlFor="slot-notes">Notes</FieldLabel>
            <Textarea
              id="slot-notes"
              rows={2}
              placeholder="Kit, timings, anything to know"
              {...register("notes")}
            />
            <FieldError>{errorFor("notes")}</FieldError>
          </Field>

          {slot && onCopy && programme.nights.length > 1 && (
            <Field>
              <FieldLabel id="slot-copy-label">Also put it on</FieldLabel>
              <div className="flex flex-wrap items-center gap-2">
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  size="sm"
                  aria-labelledby="slot-copy-label"
                  value={copyTo}
                  onValueChange={setCopyTo}
                  className="flex-wrap"
                >
                  {programme.nights
                    .filter((n) => n.id !== slot.night_id)
                    .map((n) => (
                      <ToggleGroupItem key={n.id} value={String(n.id)} className="px-3">
                        {nightLabel(n.date)}
                      </ToggleGroupItem>
                    ))}
                </ToggleGroup>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!copyTo.length || copying}
                  onClick={async () => {
                    setCopying(true);
                    if (await onCopy(copyTo.map(Number))) setCopyTo([]);
                    setCopying(false);
                  }}
                >
                  {copying
                    ? "Copying…"
                    : copyTo.length
                      ? `Copy to ${copyTo.length} night${copyTo.length === 1 ? "" : "s"}`
                      : "Copy"}
                </Button>
              </div>
            </Field>
          )}

          <ErrorAlert message={submitError} title="Not saved" />
        </div>

        <ResponsiveDialogFooter>
          {onDelete && slot && (
            <Button
              type="button"
              variant="outline"
              className="text-destructive sm:mr-auto"
              onClick={onDelete}
            >
              Remove session
            </Button>
          )}
          {onComment && slot && (
            <Button type="button" variant="outline" onClick={onComment}>
              <MessageSquarePlus /> Comment
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Saving…" : slot ? "Save changes" : "Add session"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

/** A session as NCOs see it: what, when, where and who, and a way to comment. */
export function SlotDetailsDialog({
  open,
  onOpenChange,
  programme,
  slot,
  onComment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programme: Programme;
  slot: Slot | null;
  onComment: () => void;
}) {
  const kinds = useKinds();
  if (!slot) return null;
  const night = programme.nights.find((n) => n.id === slot.night_id);
  const room = programme.rooms.find((r) => r.id === slot.room_id);
  const rows: [string, string | null][] = [
    ["When", `${nightLabel(night?.date ?? "")}, ${periodLabel(slot.period).toLowerCase()}`],
    [
      "Who",
      whoLabel(
        slot.flights,
        programme.flights.map((f) => f.key)
      ),
    ],
    ["Kind", categoryLabel(slot.category, kinds)],
    ["Room", room?.name ?? null],
    ["Running it", [slot.instructor, ...slot.people.map((p) => p.name)].filter(Boolean).join(", ") || null],
    ["Notes", slot.notes],
  ];
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{slot.title}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Only staff can change the programme. Comment to ask for a change.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="whitespace-pre-wrap">{value ?? "—"}</dd>
            </div>
          ))}
        </dl>
        <ResponsiveDialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" onClick={onComment}>
            <MessageSquarePlus /> Comment
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
