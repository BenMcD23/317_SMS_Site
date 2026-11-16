"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, X, Copy, Check, Lock, ExternalLink, Truck, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

/**
 * One row on the order list. The badge/cadet text links back to the order item the
 * entry was created from, and its QM notes are shown and editable inline so the
 * order list can be worked through without leaving the tab. `stage` decides which
 * action (if any) and audit lines are shown, matching where the entry currently sits
 * in the queued -> ordered -> received flow.
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
  const {
    resolveEntry,
    onGoTo: goToOrderItem,
    onRemove: handleRemoveOrderListEntry,
    onMarkOrdered: handleMarkEntryOrdered,
    onMarkReceived: handleMarkEntryReceived,
    markingOrderedId,
    markingReceivedId,
  } = actions;
  const ref = resolveEntry(entry);
  const notes = ref?.item.qmNotes ?? [];
  const canEditNotes = stage === "toOrder" && !!ref && !ref.order.completed;

  return (
    <li key={entry.id} className="bg-muted/30 space-y-2 rounded-md border px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        {selection && (
          <Checkbox
            className="mt-0.5 size-5"
            checked={selection.checked}
            onCheckedChange={(c) => selection.onChange(c === true)}
            aria-label={`Select ${entry.badgeName} for ${entry.cadetName}`}
          />
        )}
        {ref ? (
          <button
            type="button"
            onClick={() => goToOrderItem(ref)}
            className="group focus-visible:ring-ring min-w-0 flex-1 rounded text-left focus:outline-none focus-visible:ring-2"
            title={`Go to ${ref.order.cadetName}'s order`}
          >
            <p className="text-sm">
              <span className="font-medium underline-offset-2 group-hover:underline">{entry.badgeName}</span>
              <span className="text-muted-foreground"> — {entry.cadetName}</span>
              <ExternalLink className="text-muted-foreground ml-1.5 inline h-3 w-3 shrink-0 align-[-1px]" />
            </p>
            <p className="text-muted-foreground text-[10px]">
              Ordered {formatTimestamp(ref.order.timestamp)}
              {ref.order.completed && " · order completed"}
            </p>
          </button>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-medium">{entry.badgeName}</span>
              <span className="text-muted-foreground"> — {entry.cadetName}</span>
            </p>
            <p className="text-muted-foreground text-[10px]">Original order no longer available</p>
          </div>
        )}

        {stage === "toOrder" && (
          <Button
            size="icon"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive h-6 w-6 shrink-0"
            onClick={() => handleRemoveOrderListEntry(entry.id)}
            aria-label="Remove from order list"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Audit trail — who queued, ordered, and received this badge */}
      <div className="space-y-0.5">
        <p className="text-muted-foreground text-[10px]">
          Added to list {formatTimestamp(entry.addedAt)}
          {entry.addedBy && <> · {entry.addedBy}</>}
        </p>
        {entry.orderedAt && (
          <p className="text-muted-foreground text-[10px]">
            Marked ordered {formatTimestamp(entry.orderedAt)}
            {entry.orderedBy && <> · {entry.orderedBy}</>}
          </p>
        )}
        {entry.receivedAt && (
          <p className="text-muted-foreground text-[10px]">
            Marked received {formatTimestamp(entry.receivedAt)}
            {entry.receivedBy && <> · {entry.receivedBy}</>}
          </p>
        )}
      </div>

      {stage === "toOrder" && (
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs disabled:opacity-40 sm:h-7 sm:w-full"
          disabled={markingOrderedId === entry.id}
          onClick={() => handleMarkEntryOrdered(entry.id)}
        >
          <Truck className="mr-1.5 h-3 w-3" />
          {markingOrderedId === entry.id ? "Marking..." : "Mark as Ordered"}
        </Button>
      )}

      {stage === "ordered" && (
        <Button
          size="sm"
          variant="outline"
          className="border-success/40 text-success hover:bg-success/10 hover:text-success h-8 text-xs disabled:opacity-40 sm:h-7 sm:w-full"
          disabled={markingReceivedId === entry.id}
          onClick={() => handleMarkEntryReceived(entry.id)}
        >
          <Inbox className="mr-1.5 h-3 w-3" />
          {markingReceivedId === entry.id ? "Marking..." : "Mark as Received"}
        </Button>
      )}

      {ref && (
        <QmNotes
          notes={notes}
          editable={canEditNotes}
          itemLabel={entry.badgeName}
          onAdd={(content) => actions.onAddNote(ref.order.id, ref.item.id, content)}
          onDelete={(noteId) => actions.onDeleteNote(ref.order.id, ref.item.id, noteId)}
        />
      )}
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
    <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
      <label className="flex cursor-pointer items-center gap-2 text-sm">
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

/**
 * The badge orders page's Order List tab: badges queued for the supplier,
 * on order, and received, each moving through its own To Order -> Ordered ->
 * Received. Split out of the page, which had grown past 1,500 lines.
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function handleCopyEntries(entries: BadgeOrderListEntry[], key: string) {
    const text = entries.map((e) => `${e.badgeName} — ${e.cadetName}`).join("\n");
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="font-semibold">To Order</p>
              <p className="text-muted-foreground text-xs">Badges queued for the next supplier order</p>
            </div>
            <Badge variant="secondary" className="text-xs">
              {toOrder.length} badge{toOrder.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {toOrder.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No badges queued. Use &quot;Add to Order List&quot; on an order item.
            </p>
          ) : (
            <>
              {toOrder.length > 1 && (
                <BulkBar
                  entries={toOrder}
                  selected={selected.toOrder}
                  onSelect={(ids) => setTicked((prev) => ({ ...prev, toOrder: ids }))}
                  step="ordered"
                  busy={actions.markingMany === "ordered"}
                  onMark={() => markSelected("toOrder")}
                />
              )}
              <ul className="space-y-1.5">
                {toOrder.map((entry) => (
                  <OrderListEntry
                    key={entry.id}
                    entry={entry}
                    stage="toOrder"
                    actions={actions}
                    selection={selectionFor("toOrder", toOrder, entry.id)}
                  />
                ))}
              </ul>
              <div className="flex justify-end pt-1">
                <Button size="sm" variant="outline" onClick={() => handleCopyEntries(toOrder, "toOrder")}>
                  {copiedKey === "toOrder" ? (
                    <Check className="text-success mr-2 h-4 w-4" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
                  )}
                  {copiedKey === "toOrder" ? "Copied" : "Copy List"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="font-semibold">Ordered</p>
              <p className="text-muted-foreground text-xs">Sent to the supplier, awaiting delivery</p>
            </div>
            <Badge variant="secondary" className="text-xs">
              {ordered.length} badge{ordered.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {ordered.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">Nothing on order.</p>
          ) : (
            <>
              {ordered.length > 1 && (
                <BulkBar
                  entries={ordered}
                  selected={selected.ordered}
                  onSelect={(ids) => setTicked((prev) => ({ ...prev, ordered: ids }))}
                  step="received"
                  busy={actions.markingMany === "received"}
                  onMark={() => markSelected("ordered")}
                />
              )}
              <ul className="space-y-1.5">
                {ordered.map((entry) => (
                  <OrderListEntry
                    key={entry.id}
                    entry={entry}
                    stage="ordered"
                    actions={actions}
                    selection={selectionFor("ordered", ordered, entry.id)}
                  />
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {received.length > 0 && (
        <Card className="opacity-80">
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">Received</p>
                  <Badge className="border-success/40 bg-success/15 text-success text-xs">
                    <Lock className="mr-1 h-3 w-3" />
                    Complete
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs">Delivered and closed out</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {received.length} badge{received.length !== 1 ? "s" : ""}
                </Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setShowReceived((s) => !s)}
                  aria-label={showReceived ? "Collapse" : "Expand"}
                >
                  {showReceived ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardHeader>
          {showReceived && (
            <CardContent className="space-y-3 pt-4">
              <ul className="space-y-1.5">
                {received.map((entry) => (
                  <OrderListEntry key={entry.id} entry={entry} stage="received" actions={actions} />
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
