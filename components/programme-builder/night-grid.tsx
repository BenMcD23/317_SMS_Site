"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  AlertTriangle,
  Lightbulb,
  MessageSquare,
  MessageSquarePlus,
  OctagonAlert,
  Pencil,
  Plus,
} from "lucide-react";

import { Button } from "@317/ui-common/components/ui/button";
import { cn } from "@317/ui-common/lib/utils";
import { flightBadgeClass } from "@/lib/cadet-format";
import {
  categoryColour,
  cellId,
  HALVES,
  layoutRow,
  nightLabel,
  periodLabel,
  type Night,
  type Period,
  type Programme,
  type RowKey,
  type Severity,
  type Slot,
  type SuggestionOption,
} from "@/lib/programme-builder";
import { useKinds } from "@/components/programme-builder/use-programme";

export type Cell = { nightId: number; row: RowKey; flight: string };

/** What's being dragged, for the drop targets and the overlay. */
export type DragData =
  | { kind: "bank"; id: number; title: string; category: string; wholeNight: boolean }
  | {
      kind: "slot";
      slot: Slot;
    };

/**
 * One parade night as a grid: a column per flight, a row per half (and one
 * for the whole night when something runs all night or is being dragged).
 * Staff drag sessions in from the bank or between cells, or tap + in an empty
 * cell; NCOs see the same grid without the handles. Each session shows its
 * room, who's on it, its comments and whether the checks found anything.
 */
export function NightGrid({
  night,
  programme,
  canEdit,
  dragging,
  highlight,
  severityBySlot,
  openThreads,
  suggestionFor,
  onOpenSlot,
  onCommentSlot,
  onCommentNight,
  onEditNight,
  onAdd,
  onSuggest,
}: {
  night: Night;
  programme: Programme;
  canEdit: boolean;
  dragging: DragData | null;
  /** A session or night to ring: from "Show" or a comment's quote. */
  highlight: { slotId?: number | null; nightId?: number | null } | null;
  severityBySlot: Map<number, Severity>;
  /** Open threads on the night itself. */
  openThreads: number;
  suggestionFor: (cell: Cell) => SuggestionOption | undefined;
  onOpenSlot: (slot: Slot) => void;
  onCommentSlot: (slot: Slot) => void;
  onCommentNight: () => void;
  onEditNight: () => void;
  onAdd: (cell: Cell) => void;
  onSuggest: (cell: Cell, option: SuggestionOption) => void;
}) {
  const flights = programme.flights.map((f) => f.key);
  const wholeNightDrag =
    dragging?.kind === "bank"
      ? dragging.wholeNight
      : dragging?.kind === "slot" && dragging.slot.period === null;
  const rows: RowKey[] = [
    ...(night.slots.some((s) => s.period === null) || wholeNightDrag ? (["all"] as const) : []),
    ...HALVES.map((h) => h.period),
  ];
  const ringed = highlight?.nightId === night.id && !highlight.slotId;
  const details = [night.uniform, night.duty_nco && `Duty NCO ${night.duty_nco}`].filter(Boolean).join(" · ");

  return (
    <section
      id={`night-${night.id}`}
      aria-label={nightLabel(night.date)}
      className={cn("bg-card scroll-mt-24 rounded-lg border", ringed && "ring-primary ring-2")}
    >
      <header className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{nightLabel(night.date)}</h3>
          <p className="text-muted-foreground text-xs">
            {details || (canEdit ? "No uniform or duty NCO yet" : "")}
          </p>
          {night.notes && <p className="text-sm">{night.notes}</p>}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCommentNight}
            aria-label={`Comment on ${nightLabel(night.date)}${openThreads ? `, ${openThreads} open` : ""}`}
          >
            {openThreads ? <MessageSquare /> : <MessageSquarePlus />}
            {openThreads > 0 && <span className="tabular-nums">{openThreads}</span>}
          </Button>
          {canEdit && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onEditNight}
              aria-label={`Change ${nightLabel(night.date)}`}
            >
              <Pencil />
            </Button>
          )}
        </div>
      </header>

      <div
        className="grid grid-cols-[2.25rem_repeat(var(--cols),minmax(0,1fr))] gap-px p-1 sm:grid-cols-[3.25rem_repeat(var(--cols),minmax(0,1fr))]"
        style={{ "--cols": flights.length } as React.CSSProperties}
      >
        <div />
        {programme.flights.map((f) => (
          <div key={f.key} className="flex items-center justify-center gap-1 py-1">
            <span
              className={cn("rounded border px-1.5 text-xs font-semibold", flightBadgeClass(f.key))}
              title={f.label}
            >
              {f.key}
            </span>
            <span className="text-muted-foreground hidden text-xs lg:inline">~{f.expected}</span>
          </div>
        ))}
        {rows.map((row) => (
          <Row
            key={row}
            row={row}
            night={night}
            flights={flights}
            canEdit={canEdit}
            roomName={(id) => programme.rooms.find((r) => r.id === id)?.name}
            highlight={highlight}
            severityBySlot={severityBySlot}
            suggestionFor={suggestionFor}
            onOpenSlot={onOpenSlot}
            onCommentSlot={onCommentSlot}
            onAdd={onAdd}
            onSuggest={onSuggest}
          />
        ))}
      </div>
    </section>
  );
}

function Row({
  row,
  night,
  flights,
  canEdit,
  roomName,
  highlight,
  severityBySlot,
  suggestionFor,
  onOpenSlot,
  onCommentSlot,
  onAdd,
  onSuggest,
}: {
  row: RowKey;
  night: Night;
  flights: string[];
  canEdit: boolean;
  roomName: (id: number | null) => string | undefined;
  highlight: { slotId?: number | null; nightId?: number | null } | null;
  severityBySlot: Map<number, Severity>;
  suggestionFor: (cell: Cell) => SuggestionOption | undefined;
  onOpenSlot: (slot: Slot) => void;
  onCommentSlot: (slot: Slot) => void;
  onAdd: (cell: Cell) => void;
  onSuggest: (cell: Cell, option: SuggestionOption) => void;
}) {
  const { placed, lanes } = layoutRow(night.slots, row, flights);
  const half = HALVES.find((h) => h.period === row);
  const filled = new Set(placed.flatMap((p) => Array.from({ length: p.span }, (_, i) => p.start + i)));
  // The whole-night row also fills the halves beneath it.
  const allNight = layoutRow(night.slots, "all", flights).placed;
  const coveredAllNight = new Set(
    allNight.flatMap((p) => Array.from({ length: p.span }, (_, i) => p.start + i))
  );
  const anyEmpty = flights.some((_, c) => !filled.has(c) && !(row !== "all" && coveredAllNight.has(c)));

  return (
    <>
      <div className="text-muted-foreground flex flex-col items-center justify-center py-2 text-center text-xs leading-tight">
        <span className="font-semibold">{half ? half.short : "All"}</span>
        <span className="hidden sm:inline">{half ? half.time : "night"}</span>
      </div>
      <div
        className="grid gap-1"
        style={{
          gridColumn: "2 / -1",
          gridTemplateColumns: `repeat(${flights.length}, minmax(0, 1fr))`,
          // The spare row under the sessions holds + and the suggestion; a row
          // with nothing empty keeps only a sliver to drop onto.
          gridTemplateRows: `repeat(${lanes}, auto) minmax(${anyEmpty || !lanes ? "2.75rem" : "0.25rem"}, auto)`,
        }}
      >
        {flights.map((flight, c) => {
          const cell = { nightId: night.id, row, flight };
          const empty = !filled.has(c) && !(row !== "all" && coveredAllNight.has(c));
          return (
            <DropCell
              key={flight}
              cell={cell}
              column={c}
              canEdit={canEdit}
              empty={empty}
              label={`${flight} Flight, ${periodLabel(row === "all" ? null : (row as Period)).toLowerCase()}, ${nightLabel(night.date)}`}
              suggestion={empty && row !== "all" ? suggestionFor(cell) : undefined}
              onAdd={() => onAdd(cell)}
              onSuggest={(o) => onSuggest(cell, o)}
            />
          );
        })}
        {placed.map((p) => (
          <SlotChip
            key={`${p.slot.id}-${p.start}`}
            slot={p.slot}
            first={p.start === placed.find((q) => q.slot.id === p.slot.id)?.start}
            style={{ gridColumn: `${p.start + 1} / span ${p.span}`, gridRow: p.lane + 1 }}
            canEdit={canEdit}
            room={roomName(p.slot.room_id)}
            ringed={highlight?.slotId === p.slot.id}
            severity={severityBySlot.get(p.slot.id)}
            onOpen={() => onOpenSlot(p.slot)}
            onComment={() => onCommentSlot(p.slot)}
          />
        ))}
      </div>
    </>
  );
}

function DropCell({
  cell,
  column,
  canEdit,
  empty,
  label,
  suggestion,
  onAdd,
  onSuggest,
}: {
  cell: Cell;
  column: number;
  canEdit: boolean;
  empty: boolean;
  label: string;
  suggestion?: SuggestionOption;
  onAdd: () => void;
  onSuggest: (option: SuggestionOption) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: cellId(cell.nightId, cell.row, cell.flight),
    disabled: !canEdit,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ gridColumn: column + 1, gridRow: "1 / -1" }}
      className={cn(
        "flex flex-col justify-end rounded-md p-0.5",
        empty && "bg-muted/40",
        isOver && "bg-primary/10 ring-primary/50 ring-2"
      )}
    >
      {canEdit && empty && (
        <div className="flex min-w-0 items-center gap-0.5">
          {suggestion ? (
            <button
              type="button"
              onClick={() => onSuggest(suggestion)}
              aria-label={`Add ${suggestion.title} to ${label}: ${suggestion.reason}`}
              title={suggestion.reason}
              className="text-muted-foreground hover:text-foreground hover:border-primary/50 flex min-h-8 min-w-0 flex-1 items-center gap-1 rounded-md border border-dashed px-1.5 text-left text-xs"
            >
              <Lightbulb className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{suggestion.title}</span>
            </button>
          ) : (
            <span className="flex-1" />
          )}
          <Button variant="ghost" size="icon-sm" onClick={onAdd} aria-label={`Add a session for ${label}`}>
            <Plus />
          </Button>
        </div>
      )}
    </div>
  );
}

const SEVERITY_ICON: Partial<
  Record<Severity, { icon: typeof AlertTriangle; className: string; label: string }>
> = {
  clash: { icon: OctagonAlert, className: "text-destructive", label: "Clash" },
  warning: { icon: AlertTriangle, className: "text-warning", label: "Check this" },
};

export function SlotChip({
  slot,
  first = true,
  style,
  canEdit,
  ringed = false,
  severity,
  onOpen,
  onComment,
  overlay = false,
  room,
}: {
  slot: Slot;
  /** The first run of a session that's drawn in two places carries its id. */
  first?: boolean;
  style?: React.CSSProperties;
  canEdit: boolean;
  ringed?: boolean;
  severity?: Severity;
  onOpen?: () => void;
  onComment?: () => void;
  /** Drawn under the pointer while dragging. */
  overlay?: boolean;
  room?: string;
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `slot:${slot.id}:${style?.gridColumn ?? "overlay"}`,
    data: { kind: "slot", slot } satisfies DragData,
    disabled: !canEdit || overlay,
  });
  const kinds = useKinds();
  const mark = severity ? SEVERITY_ICON[severity] : undefined;
  const who = [slot.instructor, ...slot.people.map((p) => p.name.split(" ").slice(-1)[0])]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      ref={setNodeRef}
      id={first && !overlay ? `slot-${slot.id}` : undefined}
      style={{ ...style, borderLeftColor: categoryColour(slot.category, kinds) }}
      {...(canEdit && !overlay ? listeners : {})}
      className={cn(
        "bg-card relative z-10 flex min-w-0 scroll-mt-24 flex-col gap-0.5 rounded-md border border-l-4 p-1.5 text-xs",
        canEdit && !overlay && "cursor-grab select-none [-webkit-touch-callout:none] active:cursor-grabbing",
        isDragging && "opacity-40",
        ringed && "ring-primary ring-2",
        overlay && "w-44 shadow-lg"
      )}
    >
      <div className="flex min-w-0 items-start gap-1">
        {mark && (
          <mark.icon
            className={cn("mt-0.5 size-3.5 shrink-0", mark.className)}
            aria-label={mark.label}
            role="img"
          />
        )}
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left font-medium break-words after:absolute after:inset-0 after:content-['']"
          aria-label={`${slot.title}${mark ? ` (${mark.label.toLowerCase()})` : ""}`}
        >
          <span className="line-clamp-3">{slot.title}</span>
        </button>
      </div>
      {room && <p className="text-muted-foreground truncate">{room}</p>}
      {who && <p className="text-muted-foreground truncate">{who}</p>}
      {onComment && (
        <div className="relative z-10 -mr-1 -mb-1 flex justify-end">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={onComment}
            aria-label={`Comment on ${slot.title}${slot.open_comments ? `, ${slot.open_comments} open` : ""}`}
          >
            {slot.open_comments ? (
              <span className="flex items-center gap-0.5">
                <MessageSquare className="size-3.5" />
                <span className="text-[11px] tabular-nums">{slot.open_comments}</span>
              </span>
            ) : (
              <MessageSquarePlus className="size-3.5" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
