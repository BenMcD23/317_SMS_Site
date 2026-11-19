"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Plus,
  Trash2,
  ArrowUpDown,
  PackageMinus,
  CheckCircle2,
  RotateCcw,
  Bell,
  FileSpreadsheet,
  ShoppingCart,
  Ruler,
} from "lucide-react";
import { SearchableSelect } from "@/components/searchable-select";
import { Button } from "@317/ui-common/components/ui/button";
import { Badge } from "@317/ui-common/components/ui/badge";
import { PageHeader } from "@317/ui-common/components/page-header";
import { CountTabs } from "@/components/count-tabs";
import { EmptyState } from "@317/ui-common/components/empty-state";
import { ErrorAlert } from "@317/ui-common/components/error-alert";
import { Input } from "@317/ui-common/components/ui/input";
import { Label } from "@317/ui-common/components/ui/label";
import { Checkbox } from "@317/ui-common/components/ui/checkbox";
import { Order, OrderItem, StockItem, LogsForm, isRemovedFromStock } from "@/lib/stores-types";
import { useReference } from "@/lib/reference";
import { SizeCombobox } from "@/components/size-combobox";
import { useConfirm } from "@/components/confirm-dialog";
import { OrderDisclosure, OrderList, OrderListSkeleton } from "@317/ui-common/components/order-disclosure";
import { ExitCollapse, useExitCollapse } from "@/components/exit-collapse";
import { QmNotes } from "@/components/qm-notes";
import { useOrderWorkflow } from "@/lib/use-order-workflow";
import { useStockList } from "@/lib/stores-stock";
import { useApiQuery } from "@/lib/use-api-query";
import { PreviousSizesPopover } from "@/components/previous-sizes-popover";
import Link from "next/link";
import { formatDate, formatTimestamp } from "@/lib/format";
import { compareByLastName } from "@/lib/cadet-format";
import { searchOrders } from "@/lib/order-search";
import { type DraftItem, emptyDraftItem } from "./components/draft-item";
import { KittingDialog } from "./components/kitting-dialog";
import { NewUniformOrderDialog } from "./components/new-order-dialog";
import { LogsFormTab } from "./components/logs-form-tab";
import { EditSizeDialog, type SizeEdit } from "./components/edit-size-dialog";
import { SizingDetailsDisplay } from "./components/sizing-details";
import { TieLengthDialog } from "./components/tie-length-dialog";
import {
  ItemCount,
  OrderItemList,
  OrderItemRow,
  type ItemAction,
  type ItemStatus,
} from "@/components/order-item-row";
import { toast } from "sonner";
import {
  ItemTimeline,
  givenTimeline,
  logsFormTimeline,
  readyTimeline,
  stockTimeline,
} from "@/components/item-timeline";

type OrdersTab = "active" | "completed" | "kitting" | "logsform";

/** The tab an order is listed under — kitting stays on its own tab whether or not it's complete. */
function orderTab(order: Order): OrdersTab {
  if (order.kitting) return "kitting";
  return order.completed ? "completed" : "active";
}

/** Where an order's subject's issued sizes live — staff orders are keyed by
 *  user, cadet orders by CIN. Marking an item given and the Sizes popover both
 *  read it, so they can't disagree about whose record they're looking at. */
function issuancesUrlFor(order: Order): string {
  return (order as { subjectType?: string }).subjectType === "user"
    ? `/api/stores/issuances/user/${(order as { userId?: number }).userId}`
    : `/api/stores/issuances/${order.cadetCin}`;
}

const ORDERS_KEY = ["stores", "orders"];
const LOGS_FORMS_KEY = ["stores", "logs-forms"];
const NO_LOGS_FORMS: LogsForm[] = [];

export default function OrdersPage() {
  const { data: session } = useSession();
  const { itemTypes, noSizeItems } = useReference();
  const token = (session as { id_token?: string } | null)?.id_token ?? null;
  const currentUser =
    (session as { user?: { name?: string; email?: string } } | null)?.user?.name ??
    (session as { user?: { name?: string; email?: string } } | null)?.user?.email ??
    "Unknown";

  // Tab
  const [activeTab, setActiveTab] = useState<OrdersTab>("active");

  // Confirm dialog
  const { confirm: openConfirm, confirmDialog } = useConfirm();

  // Orders leaving the current tab (deleted, completed, reopened) collapse out
  const { isLeaving, exit } = useExitCollapse();

  const workflow = useOrderWorkflow<OrderItem, Order>({
    basePath: "/api/stores/orders",
    queryKey: ORDERS_KEY,
    tabOf: orderTab,
    activeTab,
    currentUser,
    confirm: openConfirm,
    exit,
  });
  const { orders, setOrders, setError, expandedIds, toggleExpand, markingAsReady, removingStock } = workflow;
  const { query: stockQuery, stock, setStock } = useStockList();
  const logsFormsQuery = useApiQuery<LogsForm[]>(LOGS_FORMS_KEY, "/api/stores/logs-forms");
  const logsForms = logsFormsQuery.data ?? NO_LOGS_FORMS;
  // The page waits for all three: matching an item to the shelf needs the stock.
  const error = workflow.error ?? stockQuery.error?.message ?? logsFormsQuery.error?.message ?? null;
  const loading = !error && (workflow.loading || stockQuery.isPending || logsFormsQuery.isPending);

  const [kittingOpen, setKittingOpen] = useState(false);
  const [pullingIn, setPullingIn] = useState(false);

  // Logs form batches
  const [addingToLogsFormId, setAddingToLogsFormId] = useState<string | null>(null);
  const [tieItemId, setTieItemId] = useState<string | null>(null);

  const [newOrderOpen, setNewOrderOpen] = useState(false);

  // The item whose size is being edited, and its order
  const [editingSize, setEditingSize] = useState<{ orderId: string; item: OrderItem } | null>(null);

  // Add item to existing order (inline per order)
  const [addingToOrderId, setAddingToOrderId] = useState<string | null>(null);
  const [addItemDraft, setAddItemDraft] = useState<DraftItem>(emptyDraftItem());

  // Mark as given
  const [markingAsGiven, setMarkingAsGiven] = useState<string | null>(null);
  const [undoingGiven, setUndoingGiven] = useState<string | null>(null);

  // Sort and search
  const [sortOrder, setSortOrder] = useState<"oldest" | "newest">("oldest");
  const [searchQuery, setSearchQuery] = useState("");

  function findStockMatch(itemType: string, size: string): StockItem | undefined {
    if (noSizeItems.has(itemType)) {
      return stock.find((s) => s.itemType === itemType);
    }
    return stock.find((s) => s.itemType === itemType && s.size === size);
  }

  async function doStockAction(
    order: Order,
    item: OrderItem,
    action: "remove" | "return",
    stockItem?: StockItem
  ) {
    const data = await workflow.stockAction<{ order: Order; stockItem: StockItem }>(order.id, item.id, {
      action,
      stockItemId: stockItem?.id,
    });
    if (!data) return;
    const updated = data.stockItem;
    setStock((prev) =>
      prev.some((s) => s.id === updated.id)
        ? prev.map((s) => (s.id === updated.id ? updated : s))
        : [...prev, updated]
    );
  }

  function handleRemoveFromStock(order: Order, item: OrderItem, stockItem: StockItem) {
    openConfirm(`Remove one ${stockItem.itemType} (${stockItem.size}) from stock?`, () =>
      doStockAction(order, item, "remove", stockItem)
    );
  }

  function handleReturnToStock(order: Order, item: OrderItem) {
    openConfirm(`Put one ${item.itemType}${item.size ? ` (${item.size})` : ""} back into stock?`, () =>
      doStockAction(order, item, "return")
    );
  }

  const handleDeleteOrder = workflow.deleteOrder;
  const handleDeleteOrderItem = (orderId: string, itemId: string, itemType: string) =>
    workflow.deleteItem(orderId, itemId, itemType);

  function openEditSize(orderId: string, item: OrderItem) {
    setEditingSize({ orderId, item });
  }

  async function handleSaveEditSize(edit: SizeEdit) {
    if (!editingSize) return false;
    const { orderId, item } = editingSize;
    const order = orders.find((o) => o.id === orderId);
    if (!order) return false;
    return patchOrder(orderId, {
      items: order.items.map((i) => (i.id === item.id ? { ...i, ...edit } : i)),
    });
  }

  const { patchOrder } = workflow;
  const handleCompleteOrder = workflow.completeOrder;
  const handleReopenOrder = workflow.reopenOrder;

  function openNewOrder() {
    setNewOrderOpen(true);
  }

  function openKitting() {
    setKittingOpen(true);
  }

  async function doPullInCFlight() {
    setPullingIn(true);
    try {
      const res = await fetch("/api/stores/orders/kit-flight", { method: "POST" });
      if (!res.ok) throw new Error("Failed to pull in C Flight");
      const created: Order[] = await res.json();
      if (created.length > 0) setOrders((prev) => [...created, ...prev]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setPullingIn(false);
    }
  }

  function handlePullInCFlight() {
    openConfirm(
      "Add every C Flight cadet to kitting (skipping any already here)? Each gets 1 of each item, with both male and female variants of shirts/trousers — delete the ones that don't apply.",
      doPullInCFlight
    );
  }

  /** Records the hand-over; true once it's saved. */
  async function doMarkItemAsGiven(order: Order, item: OrderItem): Promise<boolean> {
    setMarkingAsGiven(item.id);
    try {
      const isUserOrder = (order as { subjectType?: string }).subjectType === "user";
      const issuanceUrl = issuancesUrlFor(order);
      const issuanceBody = isUserOrder
        ? {
            givenBy: currentUser,
            items: [{ itemCategory: item.itemType, sizeGiven: item.size || null, orderItemId: item.id }],
          }
        : {
            givenBy: currentUser,
            items: [{ itemType: item.itemType, sizeGiven: item.size || null, orderItemId: item.id }],
          };
      const res = await fetch(issuanceUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(issuanceBody),
      });
      if (!res.ok) throw new Error("Failed to mark as given");
      // The issuance can change "last received" on this cadet's other orders
      // too, so reload them all. The cards stay on screen while it does.
      await workflow.reload();
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      return false;
    } finally {
      setMarkingAsGiven(null);
    }
  }

  async function doUndoGiven(order: Order, item: OrderItem) {
    setUndoingGiven(item.id);
    try {
      const undone = await workflow.itemAction(
        order.id,
        item.id,
        "undo-given",
        { by: currentUser },
        "Failed to undo"
      );
      // Undoing puts the cadet's "last received" back, which shows on their
      // other orders too, so reload them all. The cards stay on screen.
      if (undone) await workflow.reload();
    } finally {
      setUndoingGiven(null);
    }
  }

  // The tick hands an item out at once, with Undo in the toast instead of a
  // confirm first: on parade night it's tap, tap, tap down the list. Unticking
  // takes it back the same way. Both go in the item's history.
  async function toggleGiven(order: Order, item: OrderItem) {
    if (item.givenAt) {
      await doUndoGiven(order, item);
      toast(`${item.itemType} back to waiting`);
      return;
    }
    if (await doMarkItemAsGiven(order, item)) {
      toast(`${item.itemType} given to ${order.cadetName}`, {
        action: { label: "Undo", onClick: () => void doUndoGiven(order, item) },
      });
    }
  }

  /**
   * What the shared OrderItemRow shows for one uniform item: its status, the
   * one next step that status calls for, and the rest in the "⋯" menu.
   */
  function uniformItemRow(
    order: Order,
    item: OrderItem,
    stock: { stockMatch: StockItem | undefined; inStock: boolean; removedFromStock: boolean }
  ): React.ComponentProps<typeof OrderItemRow> {
    const { stockMatch, inStock, removedFromStock } = stock;
    const completed = !!order.completed;
    const sized = !noSizeItems.has(item.itemType);
    const needsSize = item.needSizing || (sized && !item.size);
    const onForm = logsFormEntryByItem.get(item.id);
    const canForm = item.itemType !== "Brassard";

    const status: ItemStatus = item.givenAt
      ? { label: "Given", tone: "done" }
      : needsSize
        ? { label: "Needs sizing", tone: "todo" }
        : item.readyToCollect
          ? { label: "Ready to collect", tone: "ready" }
          : removedFromStock
            ? { label: "Taken from stock", tone: "progress" }
            : onForm
              ? { label: onForm.sent ? "Ordered" : "On logs form", tone: "progress" }
              : inStock
                ? { label: "In stock", tone: "progress" }
                : { label: "To order", tone: "todo" };

    const given = !!item.givenAt;
    const noSize = needsSize ? "Needs a size first" : undefined;
    // Every step in its fixed slot, in the order the stores work. A done step
    // stays put, ticked, and taps back to undo. Once given, the forward steps
    // rest (untick to change anything) but undos still work.
    const actions: ItemAction[] = [
      ...(sized
        ? [
            {
              key: "size",
              label: needsSize ? "Enter size" : "Edit size",
              group: "size",
              icon: Ruler,
              disabled: given,
              onSelect: () => openEditSize(order.id, item),
            } satisfies ItemAction,
          ]
        : []),
      {
        key: "stock",
        label: "Remove from stock",
        group: "stock",
        icon: PackageMinus,
        busy: removingStock === item.id,
        disabled: given || !inStock,
        hint: given ? undefined : (noSize ?? "None in stock"),
        onSelect: () => stockMatch && handleRemoveFromStock(order, item, stockMatch),
        done: removedFromStock,
        doneLabel: "Removed from stock",
        undoLabel: "Put back in stock",
        onUndo: () => handleReturnToStock(order, item),
      },
      ...(canForm
        ? [
            {
              key: "form",
              label: "Add to logs form",
              group: "order",
              icon: FileSpreadsheet,
              busy: addingToLogsFormId === item.id,
              disabled: given || needsSize,
              hint: given ? undefined : noSize,
              onSelect: () => handleAddToLogsForm(item),
              done: !!onForm,
              doneLabel: onForm?.sent ? "Logs form sent" : "On logs form",
              undoLabel: "Take off logs form",
              // A form that's gone to RAFAC is part of what was ordered.
              onUndo:
                onForm && !onForm.sent ? () => handleRemoveLogsFormEntry(onForm.entryId, item.id) : undefined,
            } satisfies ItemAction,
          ]
        : []),
      {
        key: "ready",
        label: "Ready to collect",
        group: "collect",
        icon: Bell,
        busy: markingAsReady === item.id,
        disabled: given || needsSize,
        hint: given ? undefined : noSize,
        onSelect: () => handleMarkItemAsReady(order.id, item.id),
        done: !!item.readyToCollect,
        doneLabel: "Cadet told",
      },
      {
        key: "delete",
        label: "Delete item",
        group: "delete",
        icon: Trash2,
        onSelect: () => handleDeleteOrderItem(order.id, item.id, item.itemType),
      },
    ];

    // The one step that moves it on, tinted where it sits.
    const nextKey = given
      ? null
      : needsSize && sized
        ? "size"
        : !removedFromStock && inStock
          ? "stock"
          : !removedFromStock && !onForm && canForm
            ? "form"
            : !item.readyToCollect && (removedFromStock || !!onForm)
              ? "ready"
              : null;

    const timeline = [
      ...givenTimeline(item),
      ...stockTimeline(item.stockEvents),
      ...logsFormTimeline(onForm),
      ...readyTimeline(item.readyToCollect),
    ];

    return {
      name: item.itemType,
      status,
      readOnly: completed,
      given: !!item.givenAt,
      giveDisabledReason: needsSize ? "Needs a size first" : null,
      giving: markingAsGiven === item.id || undoingGiven === item.id,
      onToggleGiven: () => void toggleGiven(order, item),
      actions,
      nextKey,
      details: (
        <>
          {item.needSizing ? (
            item.sizingDetails ? (
              <SizingDetailsDisplay raw={item.sizingDetails} />
            ) : null
          ) : (
            sized && <span>Size {item.size || "—"}</span>
          )}
          {!completed && !item.givenAt && stockMatch && !removedFromStock && (
            <span className={inStock ? "text-success" : undefined}>
              {inStock
                ? `In box ${stockMatch.box}, section ${stockMatch.section} (${stockMatch.quantity} left)`
                : "None left in stock"}
            </span>
          )}
          {item.givenAt ? (
            <span>
              Given {formatTimestamp(item.givenAt)}
              {item.givenBy && ` · ${item.givenBy}`}
            </span>
          ) : (
            <span>
              {item.lastIssued
                ? `Last had ${formatDate(item.lastIssued.date)}${item.lastIssued.size ? `, size ${item.lastIssued.size}` : ""}`
                : "Never had one"}
            </span>
          )}
        </>
      ),
      notes: (
        <QmNotes
          compact
          notes={item.qmNotes}
          editable={!completed && !item.givenAt}
          itemLabel={item.itemType}
          onAdd={(content) => workflow.addNote(order.id, item.id, content)}
          onDelete={(noteId) => workflow.deleteNote(order.id, item.id, noteId)}
        />
      ),
      history: timeline.length > 0 ? <ItemTimeline events={timeline} /> : undefined,
    };
  }

  const handleMarkItemAsReady = workflow.markReady;

  function startAddToOrder(orderId: string) {
    setAddingToOrderId(orderId);
    setAddItemDraft(emptyDraftItem());
  }

  const openLogsForm = logsForms.find((f) => !f.orderedAt) ?? null;
  const pastLogsForms = logsForms.filter((f) => !!f.orderedAt);
  // Which entry each order item is on, and whether that form has gone to
  // RAFAC (an entry on a sent form can't be taken off).
  const logsFormEntryByItem = new Map(
    logsForms.flatMap((f) =>
      f.entries
        .filter((e) => e.orderItemId)
        .map(
          (e) =>
            [e.orderItemId as string, { entryId: e.id, sent: !!f.orderedAt, sentAt: f.orderedAt }] as const
        )
    )
  );

  async function refreshLogsForms() {
    await logsFormsQuery.refetch();
  }

  async function doAddToLogsForm(itemId: string, tieVariant?: "Short" | "Standard") {
    setAddingToLogsFormId(itemId);
    try {
      const res = await fetch("/api/stores/logs-forms/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderItemId: itemId, ...(tieVariant ? { tieVariant } : {}) }),
      });
      if (!res.ok) throw new Error("Failed to add to logs form");
      await refreshLogsForms();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAddingToLogsFormId(null);
    }
  }

  function handleAddToLogsForm(item: OrderItem) {
    if (item.itemType === "Tie") {
      setTieItemId(item.id);
      return;
    }
    doAddToLogsForm(item.id);
  }

  async function handleRemoveLogsFormEntry(entryId: string, itemId?: string) {
    if (itemId) setAddingToLogsFormId(itemId);
    try {
      const res = await fetch(`/api/stores/logs-forms/entries/${entryId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove entry");
      await refreshLogsForms();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      if (itemId) setAddingToLogsFormId(null);
    }
  }

  function handleMarkLogsFormOrdered(formId: string) {
    openConfirm(
      "Mark this logs form as ordered? It will be locked and new items will go on a new form.",
      async () => {
        try {
          const res = await fetch(`/api/stores/logs-forms/${formId}/mark-ordered`, { method: "POST" });
          if (!res.ok) throw new Error("Failed to mark as ordered");
          await refreshLogsForms();
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : "Unknown error");
        }
      }
    );
  }

  async function handleAddToOrder(orderId: string) {
    if (!addItemDraft.itemType) return;
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const newItem: OrderItem = {
      id: "",
      qmNotes: [],
      givenAt: null,
      givenBy: null,
      readyToCollect: null,
      ...addItemDraft,
    };
    await patchOrder(orderId, { items: [...order.items, newItem] });
    setAddingToOrderId(null);
  }

  const activeOrders = orders.filter((o) => !o.completed && !o.kitting);
  const completedOrders = orders.filter((o) => !!o.completed && !o.kitting);
  const kittingOrders = orders.filter((o) => !!o.kitting);

  const tabOrders =
    activeTab === "active" ? activeOrders : activeTab === "kitting" ? kittingOrders : completedOrders;

  // Kitting is a roll of cadets, so it reads A–Z by surname rather than by age.
  const sortedOrders = [...tabOrders].sort((a, b) => {
    if (activeTab === "kitting") return compareByLastName(a.cadetName, b.cadetName);
    const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    return sortOrder === "oldest" ? diff : -diff;
  });
  const filteredOrders = searchOrders(sortedOrders, searchQuery, (i) => i.itemType);
  const allExpanded =
    filteredOrders.length > 0 && filteredOrders.every(({ order }) => expandedIds.has(order.id));

  function toggleExpandAll() {
    workflow.toggleExpandAll(filteredOrders.map(({ order }) => order.id));
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Uniform Orders"
        description={
          loading ? "Loading…" : `${filteredOrders.length} order${filteredOrders.length !== 1 ? "s" : ""}`
        }
        actions={
          <Button onClick={openNewOrder} size="sm">
            <Plus data-icon="inline-start" />
            New order
          </Button>
        }
      />

      <CountTabs
        value={activeTab}
        onValueChange={setActiveTab}
        loading={loading}
        tabs={[
          { value: "active", label: "Active", count: activeOrders.length },
          { value: "completed", label: "Completed", count: completedOrders.length },
          { value: "kitting", label: "C Flight Kitting", count: kittingOrders.length },
          { value: "logsform", label: "Logs Form", count: openLogsForm?.entries.length ?? 0 },
        ]}
      />

      {/* Search + Sort controls */}
      {activeTab !== "logsform" && (
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search by cadet or item..."
            aria-label="Search by cadet or item"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            // Full width on a phone so the buttons drop to their own row.
            className="h-9 basis-full sm:flex-1 sm:basis-0"
          />
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            disabled={filteredOrders.length === 0}
            onClick={toggleExpandAll}
          >
            {allExpanded ? (
              <ChevronsDownUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronsUpDown className="h-3.5 w-3.5" />
            )}
            {allExpanded ? "Collapse all" : "Expand all"}
          </Button>
          {activeTab !== "kitting" && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => setSortOrder((s) => (s === "oldest" ? "newest" : "oldest"))}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {sortOrder === "oldest" ? "Oldest first" : "Newest first"}
            </Button>
          )}
        </div>
      )}

      {activeTab === "kitting" && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={handlePullInCFlight} size="sm" disabled={pullingIn}>
            <Plus data-icon="inline-start" />
            {pullingIn ? "Pulling in…" : "Pull in C Flight"}
          </Button>
          <Button onClick={openKitting} size="sm" variant="outline">
            <Plus data-icon="inline-start" />
            Add cadet
          </Button>
        </div>
      )}

      <ErrorAlert message={error} />

      {loading && <OrderListSkeleton />}

      {!loading && activeTab !== "logsform" && orders.length === 0 && (
        <EmptyState
          icon={ShoppingCart}
          title="No orders yet"
          description="Create one with the button above."
        />
      )}

      {!loading && activeTab !== "logsform" && orders.length > 0 && filteredOrders.length === 0 && (
        <p className="text-muted-foreground py-12 text-center text-sm">
          {searchQuery.trim()
            ? "No orders match your search."
            : activeTab === "active"
              ? "No active orders."
              : activeTab === "kitting"
                ? "No cadets in C Flight kitting yet. Use “Add cadet” above."
                : "No completed orders."}
        </p>
      )}

      {/* Orders list */}
      {!loading && activeTab !== "logsform" && filteredOrders.length > 0 && (
        <OrderList>
          {filteredOrders.map(({ order, items: visibleItems, itemFiltered }) => {
            const expanded = expandedIds.has(order.id);
            const isCompleted = !!order.completed;
            const needSizingCount = order.items.filter((i) => i.needSizing).length;
            const isAddingHere = addingToOrderId === order.id;

            return (
              <ExitCollapse key={order.id} id={order.id} leaving={isLeaving(order.id)}>
                <OrderDisclosure
                  open={expanded}
                  onToggle={() => toggleExpand(order.id)}
                  label={`order for ${order.cadetName}`}
                  muted={isCompleted}
                  title={
                    <>
                      {(order as { subjectType?: string }).subjectType === "cadet" ? (
                        <Link href={`/cadets/${order.cadetCin}?tab=uniform`} className="hover:underline">
                          {order.cadetName}
                        </Link>
                      ) : (
                        <span>{order.cadetName}</span>
                      )}
                      {(order as { subjectType?: string }).subjectType === "user" && (
                        <Badge variant="outline" className="text-muted-foreground font-normal">
                          Staff
                        </Badge>
                      )}
                    </>
                  }
                  meta={activeTab !== "kitting" ? formatTimestamp(order.timestamp) : undefined}
                  aside={
                    <>
                      <PreviousSizesPopover
                        issuancesUrl={issuancesUrlFor(order)}
                        recordHref={
                          (order as { subjectType?: string }).subjectType === "cadet"
                            ? `/cadets/${order.cadetCin}?tab=uniform`
                            : undefined
                        }
                        name={order.cadetName}
                        itemTypes={order.items.map((i) => i.itemType)}
                      />
                      {!isCompleted && needSizingCount > 0 && (
                        <Badge className="border-warning/40 bg-warning/15 text-warning text-xs">
                          {needSizingCount} need sizing
                        </Badge>
                      )}
                      <ItemCount
                        items={order.items}
                        shown={itemFiltered ? visibleItems.length : undefined}
                        completed={!!order.completed}
                      />
                    </>
                  }
                >
                  {itemFiltered && (
                    <p className="text-muted-foreground text-xs">
                      Showing {visibleItems.length} of {order.items.length} items matching your search.
                    </p>
                  )}
                  <OrderItemList>
                    {visibleItems.map((orderItem) => {
                      const stockMatch = findStockMatch(orderItem.itemType, orderItem.size);
                      const inStock = stockMatch && stockMatch.quantity > 0;
                      const removedFromStock = isRemovedFromStock(orderItem.stockEvents);

                      return (
                        <OrderItemRow
                          key={orderItem.id}
                          {...uniformItemRow(order, orderItem, {
                            stockMatch,
                            inStock: !!inStock,
                            removedFromStock,
                          })}
                        />
                      );
                    })}
                  </OrderItemList>

                  {/* Add item to existing order (active only) */}
                  {!isCompleted &&
                    (isAddingHere ? (
                      <div className="space-y-2 rounded-md border border-dashed p-3">
                        <p className="text-muted-foreground text-xs font-medium">Add item to order</p>
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="min-w-36 flex-1">
                            <SearchableSelect
                              aria-label="Item type"
                              value={addItemDraft.itemType}
                              onValueChange={(v) => setAddItemDraft((d) => ({ ...d, itemType: v }))}
                              placeholder="Item type"
                              className="h-8 text-sm"
                              options={itemTypes.map((t) => ({ value: t, label: t }))}
                            />
                          </div>
                          {!noSizeItems.has(addItemDraft.itemType) && (
                            <div className="w-28">
                              <SizeCombobox
                                strict
                                className="h-8 text-sm"
                                itemType={addItemDraft.itemType}
                                value={addItemDraft.size}
                                disabled={addItemDraft.needSizing}
                                onChange={(v) => setAddItemDraft((d) => ({ ...d, size: v }))}
                              />
                            </div>
                          )}
                          {!noSizeItems.has(addItemDraft.itemType) && (
                            <div className="flex items-center gap-1.5">
                              <Checkbox
                                id={`ns-add-${order.id}`}
                                checked={addItemDraft.needSizing}
                                onCheckedChange={(c) =>
                                  setAddItemDraft((d) => ({
                                    ...d,
                                    needSizing: !!c,
                                    size: !!c ? "" : d.size,
                                  }))
                                }
                              />
                              <Label
                                htmlFor={`ns-add-${order.id}`}
                                className="cursor-pointer text-xs whitespace-nowrap"
                              >
                                Need Sizing
                              </Label>
                            </div>
                          )}
                        </div>
                        {!noSizeItems.has(addItemDraft.itemType) && addItemDraft.needSizing && (
                          <Input
                            className="h-8 text-sm"
                            placeholder="Sizing details (optional)"
                            value={addItemDraft.sizingDetails}
                            onChange={(e) =>
                              setAddItemDraft((d) => ({ ...d, sizingDetails: e.target.value }))
                            }
                          />
                        )}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="h-7 px-3 text-xs"
                            disabled={!addItemDraft.itemType}
                            onClick={() => handleAddToOrder(order.id)}
                          >
                            Add
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => setAddingToOrderId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-full text-xs"
                        onClick={() => startAddToOrder(order.id)}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Add Item to Order
                      </Button>
                    ))}

                  {/* Footer actions */}
                  <div className="flex justify-end gap-2 pt-1">
                    {isCompleted ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
                        onClick={() => handleReopenOrder(order.id, order.cadetName)}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Reopen Order
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteOrder(order.id, order.cadetName)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Order
                        </Button>
                        <Button
                          size="sm"
                          className="bg-success hover:bg-success/90 text-white"
                          onClick={() => handleCompleteOrder(order.id, order.cadetName)}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Complete Order
                        </Button>
                      </>
                    )}
                  </div>
                </OrderDisclosure>
              </ExitCollapse>
            );
          })}
        </OrderList>
      )}

      {/* Logs Form tab */}
      {!loading && activeTab === "logsform" && (
        <LogsFormTab
          openForm={openLogsForm}
          pastForms={pastLogsForms}
          onRemoveEntry={(entryId) => handleRemoveLogsFormEntry(entryId)}
          onMarkOrdered={handleMarkLogsFormOrdered}
        />
      )}

      <TieLengthDialog
        open={tieItemId !== null}
        onChoose={(length) => tieItemId && doAddToLogsForm(tieItemId, length)}
        onClose={() => setTieItemId(null)}
      />

      {/* New Order Dialog */}
      <NewUniformOrderDialog
        open={newOrderOpen}
        onOpenChange={setNewOrderOpen}
        token={token}
        onCreated={(created) => setOrders((prev) => [created, ...prev])}
        onError={setError}
      />

      {/* C Flight Kitting — Add Cadet Dialog */}
      <KittingDialog
        open={kittingOpen}
        onOpenChange={setKittingOpen}
        token={token}
        onCreated={(created) => setOrders((prev) => [created, ...prev])}
        onError={setError}
      />

      {/* Confirm Dialog */}
      {confirmDialog}

      <EditSizeDialog
        key={editingSize?.item.id ?? "closed"}
        item={editingSize?.item ?? null}
        onClose={() => setEditingSize(null)}
        onSave={handleSaveEditSize}
      />
    </div>
  );
}
