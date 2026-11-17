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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { CountTabs } from "@/components/count-tabs";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import {
  Order,
  OrderItem,
  StockItem,
  SizingDetailsJSON,
  LogsForm,
  isRemovedFromStock,
} from "@/lib/stores-types";
import { useReference } from "@/lib/reference";
import { SizeCombobox } from "@/components/size-combobox";
import { useConfirm } from "@/components/confirm-dialog";
import { OrderDisclosure, OrderList, OrderListSkeleton } from "@/components/order-disclosure";
import { ExitCollapse, useExitCollapse } from "@/components/exit-collapse";
import { GivenStamp } from "@/components/given-stamp";
import { StockHistory } from "@/components/stock-history";
import { QmNotes } from "@/components/qm-notes";
import { ReadyStamp } from "@/components/ready-stamp";
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
import {
  ItemCount,
  OrderItemList,
  OrderItemRow,
  type ItemAction,
  type ItemStatus,
} from "@/components/order-item-row";
import { toast } from "sonner";

type OrdersTab = "active" | "completed" | "kitting" | "logsform";

/** The tab an order is listed under — kitting stays on its own tab whether or not it's complete. */
function orderTab(order: Order): OrdersTab {
  if (order.kitting) return "kitting";
  return order.completed ? "completed" : "active";
}

const FIT_LABELS: Record<string, string> = { bigger: "Bigger", smaller: "Smaller", same: "Same size" };

function parseSizingDetails(str: string): SizingDetailsJSON | null {
  if (!str) return null;
  try {
    return JSON.parse(str) as SizingDetailsJSON;
  } catch {
    return null;
  }
}

function SizingDetailsDisplay({ raw }: { raw: string }) {
  const parsed = parseSizingDetails(raw);
  if (!parsed) return <p className="text-foreground text-xs">{raw}</p>;

  const rows: { label: string; value: string }[] = [];
  if (parsed.currentSizeUnknown) rows.push({ label: "Current size", value: "Unknown" });
  else if (parsed.currentSize) rows.push({ label: "Current size", value: parsed.currentSize });
  if (parsed.biggerSmaller)
    rows.push({ label: "Overall fit", value: FIT_LABELS[parsed.biggerSmaller] ?? parsed.biggerSmaller });
  if (parsed.chest) rows.push({ label: "Chest", value: parsed.chest });
  if (parsed.collar) rows.push({ label: "Collar", value: parsed.collar });
  if (parsed.waist) rows.push({ label: "Waist", value: parsed.waist });
  if (parsed.leg) rows.push({ label: "Leg", value: parsed.leg });
  if (parsed.seat) rows.push({ label: "Seat", value: parsed.seat });
  if (parsed.hips) rows.push({ label: "Hips", value: parsed.hips });
  if (parsed.notes) rows.push({ label: "Notes", value: parsed.notes });

  if (rows.length === 0) return <p className="text-muted-foreground text-xs italic">No sizing details</p>;

  return (
    <div className="space-y-0.5">
      {rows.map(({ label, value }) => (
        <div key={label} className="flex gap-2 text-xs">
          <span className="text-muted-foreground w-24 shrink-0">{label}</span>
          <span className="text-foreground">{value}</span>
        </div>
      ))}
    </div>
  );
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

  // Edit size dialog — also handles needSizing + sizingDetails
  const [editSizeOpen, setEditSizeOpen] = useState(false);
  const [editSizeOrderId, setEditSizeOrderId] = useState<string | null>(null);
  const [editSizeItemId, setEditSizeItemId] = useState<string | null>(null);
  const [editSizeItemType, setEditSizeItemType] = useState("");
  const [editSizeValue, setEditSizeValue] = useState("");
  const [editNeedSizing, setEditNeedSizing] = useState(false);
  const [editSizingDetails, setEditSizingDetails] = useState("");

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
    setEditSizeOrderId(orderId);
    setEditSizeItemId(item.id);
    setEditSizeItemType(item.itemType);
    setEditSizeValue(item.size);
    setEditNeedSizing(item.needSizing);
    setEditSizingDetails(item.sizingDetails ?? "");
    setEditSizeOpen(true);
  }

  async function handleSaveEditSize() {
    if (!editSizeOrderId || !editSizeItemId) return;
    const order = orders.find((o) => o.id === editSizeOrderId);
    if (!order) return;
    await patchOrder(editSizeOrderId, {
      items: order.items.map((i) =>
        i.id === editSizeItemId
          ? {
              ...i,
              size: editNeedSizing ? "" : editSizeValue,
              needSizing: editNeedSizing,
              sizingDetails: editSizingDetails,
            }
          : i
      ),
    });
    setEditSizeOpen(false);
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

    const enterSize: ItemAction = {
      label: needsSize ? "Enter size" : "Edit size",
      icon: Ruler,
      onSelect: () => openEditSize(order.id, item),
    };
    const takeFromStock: ItemAction = {
      label: "Remove from stock",
      icon: PackageMinus,
      busy: removingStock === item.id,
      onSelect: () => stockMatch && handleRemoveFromStock(order, item, stockMatch),
    };
    const addToForm: ItemAction = {
      label: "Add to logs form",
      icon: FileSpreadsheet,
      busy: addingToLogsFormId === item.id,
      onSelect: () => handleAddToLogsForm(item),
    };
    const ready: ItemAction = {
      label: "Ready to collect",
      icon: Bell,
      busy: markingAsReady === item.id,
      onSelect: () => handleMarkItemAsReady(order.id, item.id),
    };

    // The one step that moves it on, in the order the stores work.
    const next = item.givenAt
      ? null
      : needsSize && sized
        ? enterSize
        : !removedFromStock && inStock
          ? takeFromStock
          : !removedFromStock && !onForm && canForm && !needsSize
            ? addToForm
            : !item.readyToCollect && (removedFromStock || !!onForm)
              ? ready
              : null;

    const menu: (ItemAction | "separator")[] = [];
    // A given item's size is what was handed out; untick it to change that.
    if (sized && next !== enterSize && !item.givenAt) menu.push(enterSize);
    if (removedFromStock) {
      menu.push({
        label: "Put back in stock",
        icon: PackageMinus,
        busy: removingStock === item.id,
        onSelect: () => handleReturnToStock(order, item),
      });
    } else if (!item.givenAt && next !== takeFromStock) {
      // Always listed, greyed out with the reason when there's none to take,
      // so it's found in the same place every time.
      menu.push(
        inStock
          ? takeFromStock
          : { ...takeFromStock, disabled: true, hint: needsSize ? "Needs a size first" : "None in stock" }
      );
    }
    if (canForm && onForm) {
      menu.push({
        label: onForm.sent ? "Logs form sent" : "Take off logs form",
        icon: FileSpreadsheet,
        disabled: onForm.sent,
        busy: addingToLogsFormId === item.id,
        onSelect: () => handleRemoveLogsFormEntry(onForm.entryId, item.id),
      });
    } else if (canForm && next !== addToForm && !needsSize && !item.givenAt) menu.push(addToForm);
    if (next !== ready && !item.readyToCollect && !item.givenAt && !needsSize) menu.push(ready);
    menu.push("separator", {
      label: "Delete item",
      icon: Trash2,
      destructive: true,
      onSelect: () => handleDeleteOrderItem(order.id, item.id, item.itemType),
    });

    const hasHistory = !!item.readyToCollect || !!item.givenEvents?.length || !!item.stockEvents?.length;

    return {
      name: item.itemType,
      status,
      readOnly: completed,
      given: !!item.givenAt,
      giveDisabledReason: needsSize ? "Needs a size first" : null,
      giving: markingAsGiven === item.id || undoingGiven === item.id,
      onToggleGiven: () => void toggleGiven(order, item),
      next,
      menu,
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
      history: hasHistory ? (
        <>
          <ReadyStamp readyToCollect={item.readyToCollect} givenAt={item.givenAt} />
          <GivenStamp givenAt={item.givenAt} givenBy={item.givenBy} events={item.givenEvents} />
          <StockHistory events={item.stockEvents} />
        </>
      ) : undefined,
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
        .map((e) => [e.orderItemId as string, { entryId: e.id, sent: !!f.orderedAt }] as const)
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

      {/* Tie variant dialog */}
      <ResponsiveDialog open={tieItemId !== null} onOpenChange={(open) => !open && setTieItemId(null)}>
        <ResponsiveDialogContent className="sm:max-w-sm">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Necktie Length</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <p className="text-muted-foreground text-sm">Which necktie should be demanded on the logs form?</p>
          <ResponsiveDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (tieItemId) doAddToLogsForm(tieItemId, "Short");
                setTieItemId(null);
              }}
            >
              Short
            </Button>
            <Button
              onClick={() => {
                if (tieItemId) doAddToLogsForm(tieItemId, "Standard");
                setTieItemId(null);
              }}
            >
              Standard
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

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

      {/* Edit Size / Sizing Dialog */}
      <ResponsiveDialog open={editSizeOpen} onOpenChange={setEditSizeOpen}>
        <ResponsiveDialogContent className="sm:max-w-sm">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Size & Sizing Details</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-needs-sizing"
                checked={editNeedSizing}
                onCheckedChange={(c) => {
                  setEditNeedSizing(!!c);
                  if (!c) setEditSizingDetails("");
                }}
              />
              <Label htmlFor="edit-needs-sizing" className="cursor-pointer">
                Needs Sizing
              </Label>
            </div>

            {editNeedSizing ? (
              <div className="space-y-1.5">
                <Label htmlFor="editSizingDetails">Sizing Details</Label>
                <textarea
                  id="editSizingDetails"
                  className="bg-background focus:ring-ring w-full resize-none rounded-md border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
                  rows={3}
                  placeholder="e.g. chest 96cm, height 175cm"
                  value={editSizingDetails}
                  onChange={(e) => setEditSizingDetails(e.target.value)}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="editSize">Size</Label>
                <SizeCombobox
                  strict
                  id="editSize"
                  itemType={editSizeItemType}
                  value={editSizeValue}
                  onChange={setEditSizeValue}
                  placeholder="e.g. 95/36"
                  onKeyDown={(e) => e.key === "Enter" && handleSaveEditSize()}
                />
              </div>
            )}
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setEditSizeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEditSize} disabled={editNeedSizing ? false : !editSizeValue.trim()}>
              Save
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}
