"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Copy, Inbox, Truck, X } from "lucide-react";
import { Button } from "@317/ui-common/components/ui/button";
import { Checkbox } from "@317/ui-common/components/ui/checkbox";
import { SectionHeading } from "@317/ui-common/components/section-heading";
import { BadgeOrder, BadgeOrderItem, BadgeOrderListEntry } from "@/lib/stores-types";
import { QmNotes } from "@/components/qm-notes";
import { formatTimestamp } from "@/lib/format";

/** An order list entry resolved back to the order item it was created from. */
export type OrderItemRef = { order: BadgeOrder; item: BadgeOrderItem };

type Stage = "toOrder" | "ordered" | "received";

/** What a row on the list can do; the page owns the data and the API calls. */
type Actions = {
  resolveEntry: (entry: BadgeOrderListEntry) => OrderItemRef | undefined;
  onGoTo: (ref: OrderItemRef) => void;
  onRemove: (entryId: string) => void;
  onMarkOrdered: (entryId: string) => void;
  onMarkReceived: (entryId: string) => void;
  markingOrderedId: string | null;
  markingReceivedId: string | null;
  /** Moves several entries on at once; resolves true once they're moved. */
  onMarkMany: (step: "ordered" | "received", entryIds: string[]) => Promise<boolean>;
  markingMany: "ordered" | "received" | null;
  onAddNote: (orderId: string, itemId: string, content: string) => Promise<void>;
  onDeleteNote: (orderId: string, itemId: string, noteId: string) => void;
};

/** "Added 15 Nov 2026, 21:54 · Sam Staff": one step of an entry's audit trail. */
function Step({ label, at, by }: { label: string; at: string | null; by: string | null }) {
  if (!at) return null;
  return (
    <p>
      {label} {formatTimestamp(at)}
      {by && <> · {by}</>}
    </p>
  );
}

/**
 * One badge on the order list, as a row of a framed list: the badge and cadet
 * (linking back to the order item it came from), its audit trail, and the one
 * action its stage allows. On a laptop the action sits at the right; on a
 * phone it wraps under the text. QM notes show under the row when there are
 * any, with a small "Add note" while the badge is still to order.
 */
function OrderListEntry({
  entry,
  stage,
  actions,
  selection,
}: {
  entry: BadgeOrderListEntry;
  stage: Stage;
  actions: Actions;
  /** A tick box for moving several on at once; only offered when there are several. */
  selection?: { checked: boolean; onChange: (checked: boolean) => void };
}) {
  const ref = actions.resolveEntry(entry);
  const notes = ref?.item.qmNotes ?? [];
  const canEditNotes = stage === "toOrder" && !!ref && !ref.order.completed;
  const marking =
    stage === "toOrder" ? actions.markingOrderedId === entry.id : actions.markingReceivedId === entry.id;

  return (
    <li className="flex gap-3 px-4 py-3">
      {selection && (
        <Checkbox
          className="mt-0.5 size-5"
          checked={selection.checked}
          onCheckedChange={(c) => selection.onChange(c === true)}
          aria-label={`Select ${entry.badgeName} for ${entry.cadetName}`}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-56">
            {ref ? (
              <button
                type="button"
                onClick={() => actions.onGoTo(ref)}
                className="group focus-visible:ring-ring/50 -mx-1 flex max-w-full items-center gap-1 rounded px-1 text-left outline-none focus-visible:ring-2"
                title={`Go to ${ref.order.cadetName}'s order`}
              >
                <span className="truncate font-medium underline-offset-2 group-hover:underline">
                  {entry.badgeName}
                </span>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
              </button>
            ) : (
              <p className="truncate font-medium">{entry.badgeName}</p>
            )}
            <p className="text-sm">{entry.cadetName}</p>
            <div className="text-muted-foreground mt-1 text-xs">
              {ref ? (
                <p>
                  Order placed {formatTimestamp(ref.order.timestamp)}
                  {ref.order.completed && " · order completed"}
                </p>
              ) : (
                <p>Original order no longer available</p>
              )}
              <Step label="Added to list" at={entry.addedAt} by={entry.addedBy} />
              <Step label="Marked ordered" at={entry.orderedAt} by={entry.orderedBy} />
              <Step label="Marked received" at={entry.receivedAt} by={entry.receivedBy} />
            </div>
          </div>

          {stage !== "received" && (
            <div className="flex items-center gap-1">
              {stage === "toOrder" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9"
                  disabled={marking}
                  onClick={() => actions.onMarkOrdered(entry.id)}
                >
                  <Truck data-icon="inline-start" />
                  {marking ? "Marking..." : "Mark as Ordered"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9"
                  disabled={marking}
                  onClick={() => actions.onMarkReceived(entry.id)}
                >
                  <Inbox data-icon="inline-start" />
                  {marking ? "Marking..." : "Mark as Received"}
                </Button>
              )}
              {stage === "toOrder" && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive size-9"
                  onClick={() => actions.onRemove(entry.id)}
                  aria-label="Remove from order list"
                >
                  <X />
                </Button>
              )}
            </div>
          )}
        </div>

        {ref && (
          <QmNotes
            compact
            notes={notes}
            editable={canEditNotes}
            itemLabel={entry.badgeName}
            onAdd={(content) => actions.onAddNote(ref.order.id, ref.item.id, content)}
            onDelete={(noteId) => actions.onDeleteNote(ref.order.id, ref.item.id, noteId)}
          />
        )}
      </div>
    </li>
  );
}

/**
 * "Select all" and "Mark 3 as ordered" over a list section. After the
 * supplier email goes, every queued badge moves to ordered in one go; when a
 * parcel comes, the badges in it move to received. Shown only when a section
 * holds several badges: for one, its own button does the job.
 */
function BulkBar({
  entries,
  selected,
  onSelect,
  step,
  busy,
  onMark,
}: {
  entries: BadgeOrderListEntry[];
  selected: string[];
  onSelect: (ids: string[]) => void;
  step: "ordered" | "received";
  busy: boolean;
  onMark: () => void;
}) {
  const all = selected.length === entries.length;
  return (
    <div className="bg-muted/40 flex min-h-12 flex-wrap items-center justify-between gap-2 px-4 py-2">
      <label className="flex cursor-pointer items-center gap-3 text-sm">
        <Checkbox
          className="size-5"
          checked={all ? true : selected.length > 0 ? "indeterminate" : false}
          onCheckedChange={() => onSelect(all ? [] : entries.map((e) => e.id))}
        />
        Select all
      </label>
      {selected.length > 0 && (
        <Button size="sm" className="h-9" disabled={busy} onClick={onMark}>
          {step === "ordered" ? <Truck data-icon="inline-start" /> : <Inbox data-icon="inline-start" />}
          {busy ? "Marking…" : `Mark ${selected.length} as ${step}`}
        </Button>
      )}
    </div>
  );
}

const badges = (n: number) => `${n} badge${n === 1 ? "" : "s"}`;

/** One stage's badges: a framed list with dividers, the bulk bar on top when there are several. */
function StageList({ bulk, children }: { bulk?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card overflow-hidden rounded-lg border">
      {bulk}
      <ul className={bulk ? "divide-y border-t" : "divide-y"}>{children}</ul>
    </div>
  );
}

/**
 * The badge orders page's Order List tab: badges queued for the supplier,
 * on order, and received, each moving through its own To Order -> Ordered ->
 * Received. Each stage is a heading over one framed list, rather than cards
 * of cards; received badges stay folded away until asked for.
 */
export function BadgeOrderListTab({
  toOrder,
  ordered,
  received,
  ...actions
}: Actions & {
  toOrder: BadgeOrderListEntry[];
  ordered: BadgeOrderListEntry[];
  received: BadgeOrderListEntry[];
}) {
  const [showReceived, setShowReceived] = useState(false);
  // Ticked entries per section. Kept to ids still in that section, so a badge
  // moved on elsewhere (or by someone else) drops out of the selection.
  const [ticked, setTicked] = useState<{ toOrder: string[]; ordered: string[] }>({
    toOrder: [],
    ordered: [],
  });
  const inSection = (ids: string[], entries: BadgeOrderListEntry[]) =>
    ids.filter((id) => entries.some((e) => e.id === id));
  const selected = {
    toOrder: inSection(ticked.toOrder, toOrder),
    ordered: inSection(ticked.ordered, ordered),
  };
  const selectionFor = (section: "toOrder" | "ordered", entries: BadgeOrderListEntry[], id: string) =>
    entries.length > 1
      ? {
          checked: selected[section].includes(id),
          onChange: (checked: boolean) =>
            setTicked((prev) => ({
              ...prev,
              [section]: checked ? [...prev[section], id] : prev[section].filter((x) => x !== id),
            })),
        }
      : undefined;
  async function markSelected(section: "toOrder" | "ordered") {
    const step = section === "toOrder" ? "ordered" : "received";
    if (await actions.onMarkMany(step, selected[section])) setTicked((prev) => ({ ...prev, [section]: [] }));
  }
  const [copied, setCopied] = useState(false);

  // One "badge — cadet" line each, to paste into the supplier email.
  function copyToOrder() {
    navigator.clipboard.writeText(toOrder.map((e) => `${e.badgeName} — ${e.cadetName}`).join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <SectionHeading
          title={`To order · ${badges(toOrder.length)}`}
          description="Queued for the next supplier order"
          actions={
            toOrder.length > 0 && (
              <Button size="sm" variant="outline" className="h-9" onClick={copyToOrder}>
                {copied ? (
                  <Check data-icon="inline-start" className="text-success" />
                ) : (
                  <Copy data-icon="inline-start" />
                )}
                {copied ? "Copied" : "Copy List"}
              </Button>
            )
          }
        />
        {toOrder.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
            No badges queued. Use &quot;Add to Order List&quot; on an order item.
          </p>
        ) : (
          <StageList
            bulk={
              toOrder.length > 1 && (
                <BulkBar
                  entries={toOrder}
                  selected={selected.toOrder}
                  onSelect={(ids) => setTicked((prev) => ({ ...prev, toOrder: ids }))}
                  step="ordered"
                  busy={actions.markingMany === "ordered"}
                  onMark={() => markSelected("toOrder")}
                />
              )
            }
          >
            {toOrder.map((entry) => (
              <OrderListEntry
                key={entry.id}
                entry={entry}
                stage="toOrder"
                actions={actions}
                selection={selectionFor("toOrder", toOrder, entry.id)}
              />
            ))}
          </StageList>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading
          title={`Ordered · ${badges(ordered.length)}`}
          description="Sent to the supplier, waiting for delivery"
        />
        {ordered.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
            Nothing on order.
          </p>
        ) : (
          <StageList
            bulk={
              ordered.length > 1 && (
                <BulkBar
                  entries={ordered}
                  selected={selected.ordered}
                  onSelect={(ids) => setTicked((prev) => ({ ...prev, ordered: ids }))}
                  step="received"
                  busy={actions.markingMany === "received"}
                  onMark={() => markSelected("ordered")}
                />
              )
            }
          >
            {ordered.map((entry) => (
              <OrderListEntry
                key={entry.id}
                entry={entry}
                stage="ordered"
                actions={actions}
                selection={selectionFor("ordered", ordered, entry.id)}
              />
            ))}
          </StageList>
        )}
      </section>

      {received.length > 0 && (
        <section className="flex flex-col gap-3">
          {/* The whole heading opens the list: received badges are history. */}
          <button
            type="button"
            onClick={() => setShowReceived((s) => !s)}
            aria-expanded={showReceived}
            className="focus-visible:ring-ring/50 -mx-1 flex min-h-11 items-center justify-between gap-3 rounded px-1 text-left outline-none focus-visible:ring-2"
          >
            <span className="flex flex-col gap-1">
              <span className="font-semibold">Received · {badges(received.length)}</span>
              <span className="text-muted-foreground text-sm">Delivered and closed out</span>
            </span>
            <ChevronDown
              className={`text-muted-foreground size-4 shrink-0 transition-transform ${showReceived ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          {showReceived && (
            <StageList>
              {received.map((entry) => (
                <OrderListEntry key={entry.id} entry={entry} stage="received" actions={actions} />
              ))}
            </StageList>
          )}
        </section>
      )}
    </div>
  );
}
