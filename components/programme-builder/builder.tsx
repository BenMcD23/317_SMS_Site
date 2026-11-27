"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CalendarPlus, Download, Library, MoreHorizontal, Send } from "lucide-react";
import { toast } from "sonner";

import { ErrorAlert } from "@317/ui-common/components/error-alert";
import { PageHeader } from "@317/ui-common/components/page-header";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@317/ui-common/components/responsive-dialog";
import { Badge } from "@317/ui-common/components/ui/badge";
import { Button } from "@317/ui-common/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@317/ui-common/components/ui/dropdown-menu";
import { Skeleton } from "@317/ui-common/components/ui/skeleton";
import { cn } from "@317/ui-common/lib/utils";
import { useConfirm } from "@/components/confirm-dialog";
import { CountTabs } from "@/components/count-tabs";
import { formatRelative } from "@/lib/format";
import { useApiQuery } from "@/lib/use-api-query";
import {
  issueCounts,
  movedTo,
  nightLabel,
  parseCellId,
  periodLabel,
  PROGRAMME_KEYS,
  programmeApi,
  sameSpot,
  slotPayload,
  STATUS_LABELS,
  type BankItem,
  type Night,
  type Person,
  type Severity,
  type Slot,
  type SlotForm,
  type Suggestion,
} from "@/lib/programme-builder";
import { BankPanel } from "@/components/programme-builder/bank-panel";
import { ChecksPanel, HistoryPanel, applySuggestion } from "@/components/programme-builder/checks-panel";
import { CommentsPanel, type CommentFocus } from "@/components/programme-builder/comments-panel";
import type { MentionPerson } from "@/components/programme-builder/comment-composer";
import {
  KindsDialog,
  NotesDialog,
  NightDialog,
  PublishDialog,
  RoomsDialog,
} from "@/components/programme-builder/month-dialogs";
import { NightGrid, SlotChip, type Cell, type DragData } from "@/components/programme-builder/night-grid";
import { SlotDetailsDialog, SlotDialog } from "@/components/programme-builder/slot-dialog";
import { useKinds, useProgramme } from "@/components/programme-builder/use-programme";

type Tab = "comments" | "checks" | "history";
type SlotEditor = { key: number; slot: Slot | null; start?: Partial<SlotForm>; bankItemId?: number };
type Where = { slotId?: number | null; nightId?: number | null };

const WORSE: Record<Severity, number> = { clash: 0, warning: 1, info: 2 };

/**
 * The programme builder for one month: the bank down the left, the nights in
 * the middle, and comments, checks and history down the right, as Google
 * Docs puts comments beside the page. Staff drag and drop; NCOs read and
 * comment. On a phone the three stack, and the bank opens as a sheet.
 */
export function ProgrammeBuilder({ month }: { month: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const linkedThread = Number(params.get("comment")) || null;
  const { data: programme, isLoading, error, token, run, refetch } = useProgramme(month);
  const canEdit = !!programme?.can_edit;

  const bank = useApiQuery<BankItem[]>(PROGRAMME_KEYS.bank, "/programme-builder/bank");
  const people = useApiQuery<Person[]>(
    PROGRAMME_KEYS.people(month),
    `/programme-builder/people?month=${month}`
  );
  const suggestions = useApiQuery<Suggestion[]>(
    PROGRAMME_KEYS.suggestions(month),
    `/programme-builder/months/${month}/suggestions`,
    { enabled: canEdit }
  );

  const [tab, setTab] = useState<Tab>(linkedThread ? "comments" : "checks");
  const [focus, setFocus] = useState<CommentFocus>(null);
  const [highlight, setHighlight] = useState<Where | null>(null);
  const [dragging, setDragging] = useState<DragData | null>(null);
  const [editor, setEditor] = useState<SlotEditor | null>(null);
  const [details, setDetails] = useState<Slot | null>(null);
  const [nightEditor, setNightEditor] = useState<{ key: number; night: Night | null } | null>(null);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [kindsOpen, setKindsOpen] = useState(false);
  const kinds = useKinds();
  const queryClient = useQueryClient();
  const [publishOpen, setPublishOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  // Mouse drags start after a nudge so a click still opens a session; a
  // finger has to hold first, so swiping the page still scrolls it.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  );

  const severityBySlot = useMemo(() => {
    const worst = new Map<number, Severity>();
    for (const issue of programme?.issues ?? []) {
      if (issue.severity === "info") continue;
      for (const id of issue.slot_ids) {
        const now = worst.get(id);
        if (!now || WORSE[issue.severity] < WORSE[now]) worst.set(id, issue.severity);
      }
    }
    return worst;
  }, [programme]);
  const suggestionMap = useMemo(
    () => new Map((suggestions.data ?? []).map((s) => [`${s.night_id}:${s.period}:${s.flight}`, s])),
    [suggestions.data]
  );
  const mentionable: MentionPerson[] = useMemo(
    () =>
      (people.data ?? [])
        .filter((p) => p.mentionable)
        .map((p) => ({ key: p.key, name: p.name, kind: p.kind })),
    [people.data]
  );

  if (isLoading) return <BuilderSkeleton />;
  if (error || !programme) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Programme" />
        <ErrorAlert
          message={error?.message ?? "Couldn't load the programme."}
          title="Couldn't load the programme"
        />
        <Button variant="outline" className="self-start" onClick={() => router.push("/programme")}>
          Back to programmes
        </Button>
      </div>
    );
  }

  const slots = programme.nights.flatMap((n) => n.slots);
  const counts = issueCounts(programme.issues);
  const openComments = programme.comments.filter((c) => !c.resolved_at).length;

  function show(where: Where) {
    setHighlight(where);
    const id = where.slotId ? `slot-${where.slotId}` : where.nightId ? `night-${where.nightId}` : null;
    if (id) document.getElementById(id)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function commentOn(next: CommentFocus) {
    setFocus(next);
    setTab("comments");
    setDetails(null);
    setEditor(null);
    requestAnimationFrame(() =>
      document.getElementById("programme-side")?.scrollIntoView({ block: "start", behavior: "smooth" })
    );
  }

  const slotQuote = (s: Slot) => {
    const night = programme.nights.find((n) => n.id === s.night_id);
    return `${nightLabel(night?.date ?? "")} · ${periodLabel(s.period)} · ${s.title}`;
  };

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const cell = e.over ? parseCellId(String(e.over.id)) : null;
    const data = e.active.data.current as DragData | undefined;
    if (!cell || !data) return;
    if (data.kind === "bank") {
      void run(
        (t) =>
          programmeApi.addSlot(t, month, {
            night_id: cell.nightId,
            bank_item_id: data.id,
            // A whole-night session (a sports night, a social) is for everyone.
            period: cell.row === "all" || data.wholeNight ? null : cell.row,
            flights: data.wholeNight ? [] : [cell.flight],
          }),
        `${data.title} added.`
      );
      return;
    }
    const to = movedTo(data.slot, cell);
    if (sameSpot(data.slot, to)) return;
    void run((t) => programmeApi.editSlot(t, data.slot.id, to), `${data.slot.title} moved.`);
  }

  function placeFromBank(item: BankItem) {
    setBankOpen(false);
    setEditor({
      key: Date.now(),
      slot: null,
      bankItemId: item.id,
      start: {
        nightId: programme!.nights[0]?.id,
        title: item.title,
        category: item.category,
        period: item.whole_night ? "all" : "1",
        roomId: item.room_id ? String(item.room_id) : "",
        instructor: item.instructor ?? "",
        people: (item.people ?? []).map((p) => p.key),
        lesson: item.subject_key && item.part ? `${item.subject_key}:${item.part}` : "",
      },
    });
  }

  const statusLine = (
    <span className="flex flex-wrap items-center gap-2">
      <Badge variant={programme.status === "published" ? "default" : "outline"}>
        {STATUS_LABELS[programme.status]}
      </Badge>
      <span>
        Last changed {programme.updated_by ? `by ${programme.updated_by} ` : ""}
        {formatRelative(programme.updated_at).toLowerCase()}
        {programme.published_at && ` · published ${formatRelative(programme.published_at).toLowerCase()}`}
      </span>
    </span>
  );

  const bankPanel = (
    <BankPanel
      items={bank.data}
      loading={bank.isLoading}
      error={bank.error?.message ?? null}
      canEdit={canEdit}
      rooms={programme.rooms}
      people={people.data ?? []}
      onPlace={placeFromBank}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={programme.name}
        description={statusLine}
        actions={
          <>
            {canEdit && (
              <Button variant="outline" className="lg:hidden" onClick={() => setBankOpen(true)}>
                <Library /> Session bank
              </Button>
            )}
            <Button variant="outline" asChild>
              <a href={`/api/programme/${month}/pdf`}>
                <Download /> PDF
              </a>
            </Button>
            {canEdit && (
              <>
                <Button onClick={() => setPublishOpen(true)}>
                  <Send /> Publish
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" aria-label="More for this programme">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setNightEditor({ key: Date.now(), night: null })}>
                      Add a night
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setRoomsOpen(true)}>Rooms</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setKindsOpen(true)}>Kinds of session</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setNotesOpen(true)}>
                      Important dates and notes
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() =>
                        confirm(
                          `Delete the ${programme.name} and its comments? Anything already published stays on the website and in the record.`,
                          () =>
                            void (async () => {
                              try {
                                await programmeApi.deleteMonth(token!, month);
                                router.push("/programme");
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Couldn't delete it.");
                              }
                            })()
                        )
                      }
                    >
                      Delete programme
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </>
        }
      />

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={(e: DragStartEvent) => setDragging((e.active.data.current as DragData) ?? null)}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
      >
        <div
          className={cn(
            "grid items-start gap-6",
            canEdit
              ? "lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[14rem_minmax(0,1fr)_20rem]"
              : "lg:grid-cols-[minmax(0,1fr)_20rem]"
          )}
        >
          {canEdit && (
            <aside className="hidden lg:sticky lg:top-4 lg:block lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
              {bankPanel}
            </aside>
          )}

          <div className="flex min-w-0 flex-col gap-4">
            {programme.notes && (
              <p className="text-muted-foreground rounded-lg border px-3 py-2 text-sm whitespace-pre-wrap">
                {programme.notes}
              </p>
            )}
            {programme.nights.length === 0 ? (
              <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
                No nights in this programme.{canEdit && " Add one to start."}
              </div>
            ) : (
              programme.nights.map((night) => (
                <NightGrid
                  key={night.id}
                  night={night}
                  programme={programme}
                  canEdit={canEdit}
                  dragging={dragging}
                  highlight={highlight}
                  severityBySlot={severityBySlot}
                  openThreads={
                    programme.comments.filter((c) => c.night_id === night.id && !c.slot_id && !c.resolved_at)
                      .length
                  }
                  suggestionFor={(cell: Cell) =>
                    cell.row === "all"
                      ? undefined
                      : suggestionMap.get(`${cell.nightId}:${cell.row}:${cell.flight}`)?.options[0]
                  }
                  onOpenSlot={(slot) => (canEdit ? setEditor({ key: Date.now(), slot }) : setDetails(slot))}
                  onCommentSlot={(slot) => commentOn({ slotId: slot.id, quote: slotQuote(slot) })}
                  onCommentNight={() => commentOn({ nightId: night.id, quote: nightLabel(night.date) })}
                  onEditNight={() => setNightEditor({ key: Date.now(), night })}
                  onAdd={(cell) =>
                    setEditor({
                      key: Date.now(),
                      slot: null,
                      start: {
                        nightId: cell.nightId,
                        period: cell.row === "all" ? "all" : (String(cell.row) as "1" | "2"),
                        flights: [cell.flight],
                      },
                    })
                  }
                  onSuggest={(cell, option) =>
                    void run(
                      (t) =>
                        applySuggestion(
                          t,
                          month,
                          { night_id: cell.nightId, period: cell.row as 1 | 2, flight: cell.flight },
                          option,
                          slots.find((s) => s.id === option.slot_id)?.flights
                        ),
                      `${option.title} added.`
                    )
                  }
                />
              ))
            )}
            {canEdit && (
              <Button
                variant="outline"
                className="self-start"
                onClick={() => setNightEditor({ key: Date.now(), night: null })}
              >
                <CalendarPlus /> Add a night
              </Button>
            )}
          </div>

          <aside
            id="programme-side"
            className={cn(
              "flex scroll-mt-4 flex-col gap-4",
              canEdit ? "lg:col-span-2 xl:sticky xl:top-4 xl:col-span-1" : "lg:sticky lg:top-4",
              "xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto"
            )}
          >
            <CountTabs<Tab>
              value={tab}
              onValueChange={setTab}
              tabs={[
                { value: "comments", label: "Comments", count: openComments },
                { value: "checks", label: "Checks", count: counts.clash + counts.warning },
                { value: "history", label: "History", count: programme.history.length },
              ]}
            />
            {tab === "comments" && (
              <CommentsPanel
                programme={programme}
                people={mentionable}
                focus={focus}
                onClearFocus={() => setFocus(null)}
                onShow={show}
                highlight={linkedThread}
                replyTo={params.get("reply") ? linkedThread : null}
                run={run}
                confirm={confirm}
              />
            )}
            {tab === "checks" && (
              <ChecksPanel
                programme={programme}
                suggestions={canEdit ? (suggestions.data ?? []) : undefined}
                onShow={show}
                run={run}
                confirm={confirm}
              />
            )}
            {tab === "history" && <HistoryPanel programme={programme} />}
          </aside>
        </div>

        <DragOverlay dropAnimation={null}>
          {dragging?.kind === "slot" && <SlotChip slot={dragging.slot} canEdit={false} overlay />}
          {dragging?.kind === "bank" && (
            <div className="bg-card w-44 rounded-md border border-l-4 p-1.5 text-xs font-medium shadow-lg">
              {dragging.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {canEdit && (
        <ResponsiveDialog open={bankOpen} onOpenChange={setBankOpen}>
          <ResponsiveDialogContent className="sm:max-w-md">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>Session bank</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>Tap a session to put it on a night.</ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            {bankOpen && bankPanel}
          </ResponsiveDialogContent>
        </ResponsiveDialog>
      )}

      {editor && (
        <SlotDialog
          key={editor.key}
          open
          onOpenChange={(o) => !o && setEditor(null)}
          programme={programme}
          slot={editor.slot}
          start={editor.start}
          people={people.data ?? []}
          onSave={async (values) => {
            const body = slotPayload(values);
            const ok = await run(
              (t) =>
                editor.slot
                  ? programmeApi.editSlot(t, editor.slot.id, body)
                  : programmeApi.addSlot(t, month, { ...body, bank_item_id: editor.bankItemId ?? null }),
              editor.slot ? "Session saved." : `${values.title} added.`
            );
            if (ok) setEditor(null);
          }}
          onDelete={
            editor.slot
              ? () =>
                  confirm(
                    `Remove ${editor.slot!.title} from ${nightLabel(
                      programme.nights.find((n) => n.id === editor.slot!.night_id)?.date ?? ""
                    )}?`,
                    () => {
                      void run((t) => programmeApi.deleteSlot(t, editor.slot!.id), "Session removed.");
                      setEditor(null);
                    }
                  )
              : undefined
          }
          onCopy={
            editor.slot
              ? (nightIds) => run((t) => programmeApi.copySlot(t, editor.slot!.id, nightIds), "Copied.")
              : undefined
          }
          onComment={
            editor.slot
              ? () => commentOn({ slotId: editor.slot!.id, quote: slotQuote(editor.slot!) })
              : undefined
          }
        />
      )}
      <SlotDetailsDialog
        open={!!details}
        onOpenChange={(o) => !o && setDetails(null)}
        programme={programme}
        slot={details}
        onComment={() => details && commentOn({ slotId: details.id, quote: slotQuote(details) })}
      />
      {nightEditor && (
        <NightDialog
          key={nightEditor.key}
          open
          onOpenChange={(o) => !o && setNightEditor(null)}
          programme={programme}
          night={nightEditor.night}
          run={run}
          confirm={confirm}
        />
      )}
      {notesOpen && <NotesDialog open onOpenChange={setNotesOpen} programme={programme} run={run} />}
      {publishOpen && <PublishDialog open onOpenChange={setPublishOpen} programme={programme} run={run} />}
      {roomsOpen && token && (
        <RoomsDialog
          open
          onOpenChange={setRoomsOpen}
          rooms={programme.rooms}
          token={token}
          onChanged={() => refetch()}
          confirm={confirm}
        />
      )}
      {kindsOpen && token && (
        <KindsDialog
          open
          onOpenChange={setKindsOpen}
          kinds={kinds}
          token={token}
          onChanged={() => queryClient.invalidateQueries({ queryKey: PROGRAMME_KEYS.kinds })}
          confirm={confirm}
        />
      )}
      {confirmDialog}
    </div>
  );
}

function BuilderSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <Skeleton className="h-12 w-72" />
      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <Skeleton className="hidden h-96 lg:block" />
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
