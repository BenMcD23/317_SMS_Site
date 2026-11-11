"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCopy,
  ListPlus,
  Pencil,
  Plus,
  QrCode,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { QrImage } from "@/components/qr-code";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import { SectionHeading } from "@/components/section-heading";
import { Stat, StatGroup } from "@/components/stat";
import { SessionDialog } from "@/components/training/session-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { flightBadgeClass, flightLabel } from "@/lib/cadet-format";
import { copyText } from "@/lib/clipboard";
import { formatDate, todayLocal } from "@/lib/format";
import { personName } from "@/lib/session-planner";
import { lessonUrl, THEORY_KEYS } from "@/lib/theory";
import {
  deleteSession,
  GROUPING_LABELS,
  lessonName,
  nightToText,
  periodLabel,
  saveSession,
  startFromProgramme,
  STATUS_LABELS,
  TRAINING_KEYS,
  type CatalogueSubject,
  type NightCadet,
  type NightSession,
  type SessionForm,
  type TrainingNight,
} from "@/lib/training";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

// Check-ins and QR scans arrive all evening; a minute is fresh enough to run
// a night from without hammering the API from every open phone.
const REFRESH_MS = 60_000;

const STATUS_CLASS = {
  needs: "border-primary/40 bg-primary/10 text-primary",
  behind: "border-warning/40 bg-warning/10 text-warning",
  had: "border-border bg-muted text-muted-foreground",
} as const;

function flightsText(flights: string[]): string {
  if (flights.length === 0) return "Every flight";
  if (flights.every((f) => f.length === 1)) return `${flights.join(", ")} Flight`;
  return flights.map((f) => (f.length === 1 ? flightLabel(f) : f)).join(", ");
}

/** One cadet in a group: name, flight, where they are with the lesson. */
function CadetRow({ cadet, showStatus }: { cadet: NightCadet; showStatus: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-sm">
      <span className={cn("min-w-0", cadet.unlikely && "text-muted-foreground")}>{personName(cadet)}</span>
      {cadet.flight && (
        <Badge variant="outline" className={cn("px-1.5 text-[11px]", flightBadgeClass(cadet.flight))}>
          {cadet.flight}
        </Badge>
      )}
      {showStatus && cadet.status && (
        <Badge variant="outline" className={cn("text-[11px]", STATUS_CLASS[cadet.status])}>
          {STATUS_LABELS[cadet.status]}
        </Badge>
      )}
      {cadet.scanned && (
        <span className="text-success inline-flex items-center gap-1 text-xs">
          <CheckCircle2 className="size-3.5" aria-hidden />
          Scanned in
        </span>
      )}
      {cadet.unlikely && <span className="text-muted-foreground text-xs">Rarely in</span>}
    </li>
  );
}

function countsText(s: NightSession): string {
  const parts = [`${s.counts.cadets} cadet${s.counts.cadets === 1 ? "" : "s"}`];
  if (s.lesson) {
    parts.push(`${s.counts.needs} need it`);
    if (s.counts.behind) parts.push(`${s.counts.behind} missing an earlier lesson`);
    if (s.counts.had) parts.push(`${s.counts.had} had it`);
    parts.push(`${s.counts.scanned} scanned in`);
  }
  return parts.join(" · ");
}

/** One session on the night: its inputs in a line, then who's in which group. */
function SessionBlock({
  session,
  onEdit,
  onQr,
}: {
  session: NightSession;
  onEdit: () => void;
  onQr: () => void;
}) {
  const s = session;
  const lesson = s.lesson && s.part ? lessonName(s.lesson.name, s.part, s.lesson.parts) : null;
  const how = [GROUPING_LABELS[s.grouping]];
  if (s.include === "need") how.unshift("Only who needs it");
  if (s.max_group) how.push(`up to ${s.max_group} a group`);
  const headingId = `session-${s.id}-title`;

  return (
    <article className="bg-card rounded-lg border" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="flex min-w-48 flex-1 flex-col gap-0.5">
          <p className="text-muted-foreground text-xs">
            {[periodLabel(s.period), flightsText(s.flights), s.instructor].filter(Boolean).join(" · ")}
          </p>
          <h3 id={headingId} className="font-semibold">
            {s.title}
          </h3>
          {lesson && <p className="text-sm">{lesson}</p>}
          <p className="text-muted-foreground text-xs">{how.join(" · ")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {s.lesson?.code && (
            <Button variant="outline" size="sm" className="h-9" onClick={onQr}>
              <QrCode />
              QR code
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={onEdit}
            aria-label={`Change ${s.title}`}
          >
            <Pencil />
            Change
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t px-4 py-3 sm:px-5">
        <p className="text-muted-foreground text-sm">
          {countsText(s)}
          {s.planning_with === "expected" &&
            s.counts.cadets > 0 &&
            " · nobody's checked in yet, so this is who's expected"}
        </p>
        {s.notes && <p className="text-sm whitespace-pre-line">{s.notes}</p>}
        {s.warnings.map((w) => (
          <p key={w} className="text-warning flex items-start gap-1.5 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {w}
          </p>
        ))}
        {s.groups.length > 0 && (
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {s.groups.map((g) => (
              <section key={g.label} aria-label={`${s.title}: ${g.label}`}>
                <h4 className="text-sm font-medium">
                  {g.label} <span className="text-muted-foreground font-normal">{g.cadets.length}</span>
                </h4>
                <ul className="divide-y">
                  {g.cadets.map((c) => (
                    <CadetRow key={c.cin} cadet={c} showStatus={s.grouping !== "need"} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/** A lesson's QR code, big enough to scan off a phone or a projector. */
function QrDialog({ session, onClose }: { session: NightSession | null; onClose: () => void }) {
  const url = session?.lesson?.code ? lessonUrl(session.lesson.code) : null;
  const lesson =
    session?.lesson && session.part
      ? lessonName(session.lesson.name, session.part, session.lesson.parts)
      : "";
  return (
    <ResponsiveDialog open={!!session} onOpenChange={(open) => !open && onClose()}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{lesson}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Cadets scan this to record they&apos;ve had the lesson. Ticks show here within a minute.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        {url ? (
          <QrImage url={url} alt={`QR code for ${lesson}`} className="mx-auto max-w-80" />
        ) : (
          <ErrorAlert
            title="The cadet portal's address isn't set"
            message="Set NEXT_PUBLIC_PORTAL_URL so the code can point at the portal."
          />
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

/** What the programme doc says for the night, so sessions can be checked against it. */
function ProgrammeSummary({ night }: { night: TrainingNight }) {
  const periods = [...new Set(night.programme.map((p) => p.period))].sort();
  return (
    <section aria-labelledby="programme-heading" className="bg-card rounded-lg border px-4 py-3 sm:px-5">
      <h2 id="programme-heading" className="text-sm font-semibold">
        On the programme
      </h2>
      <dl className="mt-2 flex flex-col gap-2 text-sm">
        {periods.map((period) => (
          <div key={period} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
            <dt className="text-muted-foreground shrink-0 sm:w-44">{periodLabel(period)}</dt>
            <dd className="flex flex-col gap-0.5">
              {night.programme
                .filter((p) => p.period === period)
                .map((p, i) => (
                  <span key={i}>
                    <span className="text-muted-foreground">{p.flight}:</span> {p.activity}
                    {p.link.state === "linked" && <span className="text-muted-foreground"> · lesson</span>}
                  </span>
                ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * The Nights tab: pick a night, see its programme, and set up what's running
 * with each session's own inputs. The groups come back from the API worked
 * out from the door and the QR scans, and refresh every minute, so the page
 * can be left open on a phone through the evening.
 */
export function NightPlanner() {
  const { data: auth } = useSession();
  const token = auth?.id_token ?? "";
  const { confirm, confirmDialog } = useConfirm();
  const [date, setDate] = useState(todayLocal());
  const [editing, setEditing] = useState<NightSession | null>(null);
  const [open, setOpen] = useState(false);
  // A fresh dialog each time it opens, so it starts from what was clicked.
  const [opened, setOpened] = useState(0);
  const [qrFor, setQrFor] = useState<NightSession | null>(null);
  const [starting, setStarting] = useState(false);

  const nightQuery = useApiQuery<TrainingNight>(TRAINING_KEYS.night(date), `/training/nights/${date}`, {
    enabled: !!date,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
  });
  const subjectsQuery = useApiQuery<CatalogueSubject[]>(THEORY_KEYS.subjects, "/cadets/theory/lessons");
  const night = nightQuery.data;
  const subjects = subjectsQuery.data ?? [];

  function openDialog(session: NightSession | null) {
    setEditing(session);
    setOpened((n) => n + 1);
    setOpen(true);
  }

  async function save(values: SessionForm) {
    await saveSession(token, date, values, editing?.id);
    toast.success(editing ? `${values.title.trim()} saved` : `${values.title.trim()} added`);
    setOpen(false);
    await nightQuery.refetch();
  }

  function remove(session: NightSession) {
    confirm(`Delete ${session.title} from this night?`, async () => {
      try {
        await deleteSession(token, session.id);
        toast.success(`${session.title} deleted`);
        setOpen(false);
        await nightQuery.refetch();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't delete the session.");
      }
    });
  }

  async function fromProgramme() {
    setStarting(true);
    try {
      const { sessions } = await startFromProgramme(token, date);
      toast.success(`${sessions} session${sessions === 1 ? "" : "s"} added from the programme`);
      await nightQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start from the programme.");
    } finally {
      setStarting(false);
    }
  }

  async function copy() {
    if (night && (await copyText(nightToText(night)))) toast.success("Groups copied.");
    else toast.error("Couldn't copy the groups.");
  }

  const sessions = night?.sessions ?? [];
  const lessonSessions = sessions.filter((s) => s.lesson);
  const needs = lessonSessions.reduce((n, s) => n + s.counts.needs + s.counts.behind, 0);
  const scanned = lessonSessions.reduce((n, s) => n + s.counts.scanned, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="training-night">Night</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="training-night"
              type="date"
              className="h-9 w-44"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
            {date !== todayLocal() && (
              <Button variant="ghost" size="sm" className="h-9" onClick={() => setDate(todayLocal())}>
                Today
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sessions.length > 0 && (
            <Button variant="outline" className="h-9" onClick={copy}>
              <ClipboardCopy />
              Copy groups
            </Button>
          )}
          <Button className="h-9" onClick={() => openDialog(null)} disabled={!night}>
            <Plus />
            Add session
          </Button>
        </div>
      </div>

      <ErrorAlert message={nightQuery.error?.message} title="Couldn't load the night" />
      <ErrorAlert message={subjectsQuery.error?.message} title="Couldn't load the lessons" />

      {nightQuery.isLoading && <ListSkeleton rows={4} />}

      {night && (
        <>
          <StatGroup className="grid-cols-2 sm:grid-cols-4">
            <Stat label="Checked in" value={night.checked_in} />
            <Stat label="Sessions" value={sessions.length} />
            <Stat label="Still to have tonight's lessons" value={needs} />
            <Stat label="Scanned in" value={scanned} tone={scanned ? "success" : undefined} />
          </StatGroup>

          {night.programme.length > 0 && <ProgrammeSummary night={night} />}

          {sessions.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={`Nothing set up for ${formatDate(night.date)}`}
              description={
                night.programme.length > 0
                  ? "Start from the programme: a session per activity, lessons grouped by who needs them. Change any of it after."
                  : "There's no programme imported for this night. Add sessions by hand."
              }
            >
              <div className="flex flex-wrap justify-center gap-2">
                {night.programme.length > 0 && (
                  <Button onClick={fromProgramme} disabled={starting}>
                    <ListPlus />
                    {starting ? "Starting…" : "Start from the programme"}
                  </Button>
                )}
                <Button variant="outline" onClick={() => openDialog(null)}>
                  <Plus />
                  Add session
                </Button>
              </div>
            </EmptyState>
          ) : (
            <section className="flex flex-col gap-3" aria-labelledby="sessions-heading">
              <SectionHeading
                title={<span id="sessions-heading">Sessions</span>}
                description="Groups follow who's checked in and who's scanned in. They refresh every minute."
              />
              {sessions.map((s) => (
                <SessionBlock key={s.id} session={s} onEdit={() => openDialog(s)} onQr={() => setQrFor(s)} />
              ))}
            </section>
          )}
        </>
      )}

      {night && (
        <SessionDialog
          key={opened}
          open={open}
          onOpenChange={setOpen}
          session={editing}
          subjects={subjects}
          flights={night.flights}
          onSave={save}
          onDelete={editing ? () => remove(editing) : undefined}
        />
      )}
      <QrDialog session={qrFor} onClose={() => setQrFor(null)} />
      {confirmDialog}
    </div>
  );
}
