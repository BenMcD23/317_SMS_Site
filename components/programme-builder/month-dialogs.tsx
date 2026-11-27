"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@317/ui-common/components/ui/alert";
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
import { Checkbox } from "@317/ui-common/components/ui/checkbox";
import { Input } from "@317/ui-common/components/ui/input";
import { Label } from "@317/ui-common/components/ui/label";
import { Textarea } from "@317/ui-common/components/ui/textarea";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import {
  PROGRAMME_KEYS,
  issueCounts,
  nightLabel,
  nightSchema,
  programmeApi,
  roomSchema,
  type KeyDate,
  type Kind,
  type Night,
  type NightForm,
  type Programme,
  type Room,
  type RoomForm,
} from "@/lib/programme-builder";
import type { useProgramme } from "@/components/programme-builder/use-programme";

type Run = ReturnType<typeof useProgramme>["run"];

/** A night's date, uniform, duty NCO and notes; or a new night in the month. */
export function NightDialog({
  open,
  onOpenChange,
  programme,
  night,
  run,
  confirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programme: Programme;
  /** Null adds a night. */
  night: Night | null;
  run: Run;
  confirm: (message: string, action: () => void) => void;
}) {
  const [y, m] = programme.month.split("-");
  const first = `${y}-${m}-01`;
  const last = `${y}-${m}-${String(new Date(Number(y), Number(m), 0).getDate()).padStart(2, "0")}`;
  const form = useForm<NightForm>({
    resolver: zodResolver(nightSchema),
    defaultValues: {
      date: night?.date ?? "",
      uniform: night?.uniform ?? "",
      dutyNco: night?.duty_nco ?? "",
      notes: night?.notes ?? "",
    },
    mode: "onTouched",
  });
  const { register, handleSubmit, formState } = form;
  const errorFor = (name: keyof NightForm) =>
    formState.touchedFields[name] || formState.isSubmitted ? formState.errors[name]?.message : undefined;

  const submit = handleSubmit(async (values) => {
    const ok = await run(
      (t) =>
        night
          ? programmeApi.editNight(t, night.id, values)
          : programmeApi.addNight(t, programme.month, values),
      night ? "Night saved." : "Night added."
    );
    if (ok) onOpenChange(false);
  });

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {night ? `Change ${nightLabel(night.date)}` : "Add a night"}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {night
              ? "Moving the night takes its sessions with it."
              : "An extra parade night, or one that was missed."}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <form id="night-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field data-invalid={!!errorFor("date") || undefined}>
            <FieldLabel htmlFor="night-date">Date</FieldLabel>
            <Input
              id="night-date"
              type="date"
              min={first}
              max={last}
              className="w-44"
              {...register("date")}
            />
            <FieldError>{errorFor("date")}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="night-uniform">Uniform</FieldLabel>
            <Input
              id="night-uniform"
              autoComplete="off"
              placeholder="e.g. No.3 SD"
              {...register("uniform")}
            />
            <FieldError>{errorFor("uniform")}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="night-dnco">Duty NCO</FieldLabel>
            <Input id="night-dnco" autoComplete="off" placeholder="e.g. Cpl Smith" {...register("dutyNco")} />
            <FieldError>{errorFor("dutyNco")}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="night-notes">Notes</FieldLabel>
            <Textarea
              id="night-notes"
              rows={2}
              placeholder="Shown under the night and on the PDF"
              {...register("notes")}
            />
            <FieldError>{errorFor("notes")}</FieldError>
          </Field>
        </form>
        <ResponsiveDialogFooter>
          {night && (
            <Button
              type="button"
              variant="outline"
              className="text-destructive sm:mr-auto"
              onClick={() =>
                confirm(
                  `Remove ${nightLabel(night.date)}${night.slots.length ? ` and its ${night.slots.length} session(s)` : ""}?`,
                  () =>
                    void run((t) => programmeApi.deleteNight(t, night.id), "Night removed.").then(() =>
                      onOpenChange(false)
                    )
                )
              }
            >
              Remove night
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="night-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Saving…" : night ? "Save night" : "Add night"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

/** The important dates and notes printed under the programme. */
export function NotesDialog({
  open,
  onOpenChange,
  programme,
  run,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programme: Programme;
  run: Run;
}) {
  const [notes, setNotes] = useState(programme.notes ?? "");
  const [dates, setDates] = useState<KeyDate[]>(programme.key_dates ?? []);
  const [saving, setSaving] = useState(false);
  const setDate = (i: number, part: keyof KeyDate, value: string) =>
    setDates((d) => d.map((row, j) => (j === i ? { ...row, [part]: value } : row)));
  const filled = dates.filter((d) => d.when.trim() || d.what.trim());
  const incomplete = filled.some((d) => !d.when.trim() || !d.what.trim());
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Important dates and notes</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Printed under the programme on the PDF and the website. A new month starts with the
            squadron&apos;s events from Bader.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Important dates</legend>
          {dates.length === 0 && <p className="text-muted-foreground text-sm">None yet.</p>}
          {dates.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                aria-label={`Date ${i + 1}`}
                placeholder="21-22nd March"
                maxLength={40}
                className="w-36 shrink-0"
                value={d.when}
                onChange={(e) => setDate(i, "when", e.target.value)}
              />
              <Input
                aria-label={`What's on ${i + 1}`}
                placeholder="Wing Training Weekend"
                maxLength={120}
                value={d.what}
                onChange={(e) => setDate(i, "what", e.target.value)}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove date ${i + 1}`}
                onClick={() => setDates((all) => all.filter((_, j) => j !== i))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          {dates.length < 15 && (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setDates((d) => [...d, { when: "", what: "" }])}
            >
              <Plus /> Add a date
            </Button>
          )}
          {incomplete && (
            <p className="text-destructive text-sm">Each date needs both a date and what&apos;s on.</p>
          )}
        </fieldset>
        <Field>
          <FieldLabel htmlFor="programme-notes">Notes</FieldLabel>
          <Textarea
            id="programme-notes"
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={saving || incomplete}
            onClick={async () => {
              setSaving(true);
              const body = {
                notes,
                key_dates: filled.map((d) => ({ when: d.when.trim(), what: d.what.trim() })),
              };
              if (await run((t) => programmeApi.editMonth(t, programme.month, body), "Saved."))
                onOpenChange(false);
              setSaving(false);
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

/**
 * Send the month out: the PDF onto the website, and the month into the
 * record that stats, training and check-in read. Clashes don't stop it, but
 * they're said first.
 */
export function PublishDialog({
  open,
  onOpenChange,
  programme,
  run,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programme: Programme;
  run: Run;
}) {
  const [website, setWebsite] = useState(true);
  const [record, setRecord] = useState(true);
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  const counts = issueCounts(programme.issues);
  const empty = !programme.nights.some((n) => n.slots.length);

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Publish the {programme.name}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {programme.published_at
              ? "Publishing again replaces what's on the website and in the record."
              : "Nothing leaves the SMS until you publish."}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="flex flex-col gap-4">
          {(counts.clash > 0 || counts.warning > 0) && (
            <Alert>
              <AlertTitle>
                {counts.clash > 0 && `${counts.clash} clash${counts.clash === 1 ? "" : "es"}`}
                {counts.clash > 0 && counts.warning > 0 && " and "}
                {counts.warning > 0 && `${counts.warning} thing${counts.warning === 1 ? "" : "s"} to check`}
              </AlertTitle>
              <AlertDescription>It can still go out; the Checks tab says what they are.</AlertDescription>
            </Alert>
          )}
          {empty && (
            <ErrorAlert title="Nothing to publish" message="Put some sessions on the programme first." />
          )}
          {(
            [
              [
                "publish-website",
                website,
                setWebsite,
                "The website",
                "The PDF and its pictures on the squadron website.",
              ],
              [
                "publish-record",
                record,
                setRecord,
                "The record",
                "What stats, training nights and check-in go by. Replaces an imported doc for the month.",
              ],
              [
                "publish-notify",
                notify,
                setNotify,
                "Tell everyone",
                "A notification to staff and NCOs who've turned on programme notifications.",
              ],
            ] as const
          ).map(([id, value, set, label, description]) => (
            <div key={id} className="flex items-start gap-3">
              <Checkbox id={id} checked={value} onCheckedChange={(v) => set(v === true)} className="mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <Label htmlFor={id}>{label}</Label>
                <p className="text-muted-foreground text-sm">{description}</p>
              </div>
            </div>
          ))}
        </div>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={busy || empty || (!website && !record)}
            onClick={async () => {
              setBusy(true);
              const ok = await run(
                (t) => programmeApi.publish(t, programme.month, { website, record, notify }),
                website ? "Published. The website updates in a few minutes." : "Published to the record."
              );
              setBusy(false);
              if (ok) onOpenChange(false);
            }}
          >
            {busy ? "Publishing…" : "Publish"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

/**
 * The rooms sessions can be in. Capacity lets the checks say a room is too
 * small; a room no longer used is switched off rather than deleted, so old
 * programmes still name it.
 */
export function RoomsDialog({
  open,
  onOpenChange,
  rooms,
  token,
  onChanged,
  confirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rooms: Room[];
  token: string;
  onChanged: () => Promise<unknown>;
  confirm: (message: string, action: () => void) => void;
}) {
  const [editing, setEditing] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<RoomForm>({
    resolver: zodResolver(roomSchema),
    defaultValues: { name: "", capacity: "", notes: "" },
    mode: "onTouched",
  });
  const { register, handleSubmit, formState, reset } = form;
  const errorFor = (name: keyof RoomForm) =>
    formState.touchedFields[name] || formState.isSubmitted ? formState.errors[name]?.message : undefined;

  const startEdit = (room: Room | null) => {
    setEditing(room);
    setError(null);
    reset({
      name: room?.name ?? "",
      capacity: room?.capacity ? String(room.capacity) : "",
      notes: room?.notes ?? "",
    });
  };

  const save = async (values: RoomForm, active = editing?.active ?? true, id = editing?.id) => {
    setError(null);
    try {
      await programmeApi.saveRoom(token, { ...values, active }, id);
      await onChanged();
      startEdit(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the room.");
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Rooms</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Where sessions run, and how many each holds.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        {rooms.length > 0 && (
          <ul className="divide-y rounded-lg border" aria-label="Rooms">
            {rooms.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {r.capacity ? `Holds ${r.capacity}` : "No capacity set"}
                    {r.notes && ` · ${r.notes}`}
                  </p>
                </div>
                <Switch
                  checked={r.active}
                  aria-label={`${r.name} in use`}
                  onCheckedChange={(v) =>
                    void save(
                      { name: r.name, capacity: r.capacity ? String(r.capacity) : "", notes: r.notes ?? "" },
                      v,
                      r.id
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${r.name}`}
                  onClick={() => startEdit(r)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${r.name}`}
                  onClick={() =>
                    confirm(`Delete ${r.name}? Sessions in it are left without a room.`, async () => {
                      try {
                        await programmeApi.deleteRoom(token, r.id);
                        await onChanged();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Couldn't delete the room.");
                      }
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          id="room-form"
          onSubmit={handleSubmit((v) => save(v))}
          className="grid gap-3 sm:grid-cols-[1fr_7rem]"
          noValidate
        >
          <Field data-invalid={!!errorFor("name") || undefined}>
            <FieldLabel htmlFor="room-name">{editing ? `Rename ${editing.name}` : "New room"}</FieldLabel>
            <Input id="room-name" autoComplete="off" placeholder="e.g. Classroom 1" {...register("name")} />
            <FieldError>{errorFor("name")}</FieldError>
          </Field>
          <Field data-invalid={!!errorFor("capacity") || undefined}>
            <FieldLabel htmlFor="room-capacity">Holds</FieldLabel>
            <Input id="room-capacity" inputMode="numeric" placeholder="e.g. 20" {...register("capacity")} />
            <FieldError>{errorFor("capacity")}</FieldError>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="room-notes">Notes</FieldLabel>
            <Input
              id="room-notes"
              autoComplete="off"
              placeholder="e.g. Upstairs, no projector"
              {...register("notes")}
            />
            <FieldDescription>Optional.</FieldDescription>
          </Field>
        </form>
        <ErrorAlert message={error} title="Not saved" />
        <ResponsiveDialogFooter>
          {editing && (
            <Button variant="outline" className="sm:mr-auto" onClick={() => startEdit(null)}>
              Stop editing
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
          <Button type="submit" form="room-form" disabled={formState.isSubmitting}>
            {editing ? "Save room" : "Add room"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

/**
 * The kinds of session: rename, colour or hide the built-in ones, add the
 * squadron's own. A colour fills the session's cell on the printed
 * programme, as the old doc's blue courses. A kind sessions have is hidden
 * rather than deleted, so no night loses its kind.
 */
export function KindsDialog({
  open,
  onOpenChange,
  kinds,
  token,
  onChanged,
  confirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kinds: Kind[];
  token: string;
  onChanged: () => Promise<unknown>;
  confirm: (message: string, action: () => void) => void;
}) {
  const [editing, setEditing] = useState<Kind | null>(null);
  const [label, setLabel] = useState("");
  const [colour, setColour] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const startEdit = (kind: Kind | null) => {
    setEditing(kind);
    setLabel(kind?.label ?? "");
    setColour(kind?.colour ?? null);
    setError(null);
  };

  const save = async (v: { label: string; colour: string | null; hidden: boolean }, key?: string) => {
    setError(null);
    setSaving(true);
    try {
      await programmeApi.saveKind(token, v, key);
      await onChanged();
      startEdit(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the kind.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Kinds of session</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            What the bank and the stats group sessions by. A colour fills the session on the printed
            programme.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ul className="max-h-[45vh] divide-y overflow-y-auto rounded-lg border" aria-label="Kinds">
          {kinds.map((k) => (
            <li key={k.key} className="flex items-center gap-2 px-3 py-1.5">
              <span
                aria-hidden
                className="size-4 shrink-0 rounded-sm border"
                style={{ background: k.colour ?? "transparent" }}
              />
              <p
                className={
                  k.hidden ? "text-muted-foreground min-w-0 flex-1 text-sm" : "min-w-0 flex-1 text-sm"
                }
              >
                {k.label}
              </p>
              <Switch
                checked={!k.hidden}
                aria-label={`${k.label} shown`}
                onCheckedChange={(v) => void save({ label: k.label, colour: k.colour, hidden: !v }, k.key)}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit ${k.label}`}
                onClick={() => startEdit(k)}
              >
                <Pencil />
              </Button>
              {!k.builtin && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${k.label}`}
                  onClick={() =>
                    confirm(`Delete ${k.label}?`, async () => {
                      try {
                        await programmeApi.deleteKind(token, k.key);
                        await onChanged();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Couldn't delete the kind.");
                      }
                    })
                  }
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
        <form
          id="kind-form"
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (label.trim())
              void save({ label: label.trim(), colour, hidden: editing?.hidden ?? false }, editing?.key);
          }}
        >
          <Field className="min-w-40 flex-1">
            <FieldLabel htmlFor="kind-label">{editing ? `Rename ${editing.label}` : "New kind"}</FieldLabel>
            <Input
              id="kind-label"
              autoComplete="off"
              maxLength={60}
              placeholder="e.g. Courses"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <Field className="w-auto">
            <FieldLabel htmlFor="kind-colour">Colour</FieldLabel>
            <div className="flex items-center gap-2">
              <input
                id="kind-colour"
                type="color"
                className="h-9 w-12 cursor-pointer rounded-md border bg-transparent"
                value={colour ?? "#4a86e8"}
                onChange={(e) => setColour(e.target.value)}
              />
              <Label className="text-sm font-normal">
                <Checkbox
                  checked={colour === null}
                  onCheckedChange={(v) => setColour(v === true ? null : "#4a86e8")}
                />
                None
              </Label>
            </div>
          </Field>
        </form>
        <ErrorAlert message={error} title="Not saved" />
        <ResponsiveDialogFooter>
          {editing && (
            <Button variant="outline" className="sm:mr-auto" onClick={() => startEdit(null)}>
              Stop editing
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
          <Button type="submit" form="kind-form" disabled={saving || !label.trim()}>
            {editing ? "Save kind" : "Add kind"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

/**
 * Add a kind from inside a session form: a name and a colour, then back to
 * the form with the new kind picked.
 */
export function NewKindDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (key: string) => void;
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [colour, setColour] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const kinds = await programmeApi.saveKind(session!.id_token!, {
        label: label.trim(),
        colour,
        hidden: false,
      });
      queryClient.setQueryData(PROGRAMME_KEYS.kinds, kinds);
      const made = kinds.find((k) => k.label.toLowerCase() === label.trim().toLowerCase());
      if (made) onCreated(made.key);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the kind.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-sm">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>New kind</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            A colour fills its sessions on the printed programme. Change or hide kinds later from the menu.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <form
          id="new-kind-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (label.trim()) void save();
          }}
        >
          <Field>
            <FieldLabel htmlFor="new-kind-label">Name</FieldLabel>
            <Input
              id="new-kind-label"
              autoComplete="off"
              maxLength={60}
              placeholder="e.g. Courses"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-kind-colour">Colour</FieldLabel>
            <div className="flex items-center gap-3">
              <input
                id="new-kind-colour"
                type="color"
                className="h-9 w-12 cursor-pointer rounded-md border bg-transparent"
                value={colour ?? "#4a86e8"}
                onChange={(e) => setColour(e.target.value)}
              />
              <Label className="text-sm font-normal">
                <Checkbox
                  checked={colour === null}
                  onCheckedChange={(v) => setColour(v === true ? null : "#4a86e8")}
                />
                None
              </Label>
            </div>
          </Field>
        </form>
        <ErrorAlert message={error} title="Not added" />
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="new-kind-form" disabled={saving || !label.trim()}>
            {saving ? "Adding…" : "Add kind"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

/** Add a room from inside a session form, then back to the form with it picked. */
export function NewRoomDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: number) => void;
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<RoomForm>({
    resolver: zodResolver(roomSchema),
    defaultValues: { name: "", capacity: "", notes: "" },
    mode: "onTouched",
  });
  const { register, handleSubmit, formState } = form;
  const errorFor = (name: keyof RoomForm) =>
    formState.touchedFields[name] || formState.isSubmitted ? formState.errors[name]?.message : undefined;

  const submit = handleSubmit(async (values) => {
    setError(null);
    try {
      const room = await programmeApi.saveRoom(session!.id_token!, values);
      // The month carries its rooms: refetch it so the new one is in the list.
      await queryClient.invalidateQueries({ queryKey: ["programme-builder", "month"] });
      onCreated(room.id);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the room.");
    }
  });

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-sm">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>New room</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            How many it holds lets the checks say when it&apos;s too small.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <form id="new-room-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_6rem]" noValidate>
          <Field data-invalid={!!errorFor("name") || undefined}>
            <FieldLabel htmlFor="new-room-name">Name</FieldLabel>
            <Input id="new-room-name" autoComplete="off" placeholder="e.g. Range" {...register("name")} />
            <FieldError>{errorFor("name")}</FieldError>
          </Field>
          <Field data-invalid={!!errorFor("capacity") || undefined}>
            <FieldLabel htmlFor="new-room-capacity">Holds</FieldLabel>
            <Input
              id="new-room-capacity"
              inputMode="numeric"
              placeholder="e.g. 20"
              {...register("capacity")}
            />
            <FieldError>{errorFor("capacity")}</FieldError>
          </Field>
        </form>
        <ErrorAlert message={error} title="Not added" />
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="new-room-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Adding…" : "Add room"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

/** The small "+ New kind" / "+ New room" link under a picker. */
export function NewLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto self-start p-0 text-xs"
      onClick={onClick}
    >
      <Plus className="size-3" /> {children}
    </Button>
  );
}
