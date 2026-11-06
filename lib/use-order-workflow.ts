"use client";

import { useCallback, useState } from "react";

import { apiFetch, errorDetail } from "@/lib/api-fetch";
import type { QmNote } from "@/lib/stores-types";
import { useApiQuery, useSetApiQueryData } from "@/lib/use-api-query";

/** What the workflow needs of an order item: uniform and badge items both have these. */
export interface WorkflowItem {
  id: string;
  qmNotes?: QmNote[];
}

/** What the workflow needs of an order. */
export interface WorkflowOrder<I extends WorkflowItem> {
  id: string;
  cadetName: string;
  completed?: boolean;
  items: I[];
}

/**
 * The life of a stores order, shared by the uniform and badge order pages,
 * which used to carry identical copies of every handler below: the cached
 * list, expanding cards, editing items and notes, completing, reopening and
 * deleting, Ready to Collect, and the item calls that answer with the updated
 * order. What differs (what an item is called, how giving works, how stock is
 * matched) stays on each page.
 *
 * Every write that knows its result edits the cached list in place: the page
 * never flashes to skeletons or loses your scroll position after an action.
 */
export function useOrderWorkflow<I extends WorkflowItem, O extends WorkflowOrder<I>>({
  basePath,
  queryKey,
  tabOf,
  activeTab,
  currentUser,
  confirm,
  exit,
}: {
  /** The site's own route for these orders, e.g. "/api/stores/orders". */
  basePath: string;
  queryKey: readonly unknown[];
  /** The tab an order belongs on, so one that moves off the current tab collapses out. */
  tabOf: (order: O) => string;
  activeTab: string;
  /** Who's acting, for notes and the give/stock history. */
  currentUser: string;
  confirm: (message: string, action: () => void) => void;
  exit: (id: string, commit: () => void) => void;
}) {
  const query = useApiQuery<O[]>(queryKey, basePath);
  const orders = query.data ?? EMPTY;
  const setCached = useSetApiQueryData<O[]>(queryKey);
  const setOrders = useCallback(
    (update: (prev: O[]) => O[]) => setCached((prev) => update(prev ?? [])),
    [setCached]
  );

  // Errors from actions; a failed load (or quiet reload) is the query's error.
  const [actionError, setError] = useState<string | null>(null);
  const error = actionError ?? query.error?.message ?? null;

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [markingAsReady, setMarkingAsReady] = useState<string | null>(null);
  // Order item id of the row whose stock call is in flight.
  const [removingStock, setRemovingStock] = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Expand every one of `ids`, or collapse them all if they're all open. */
  function toggleExpandAll(ids: string[]) {
    setExpandedIds((prev) => {
      const allOpen = ids.length > 0 && ids.every((id) => prev.has(id));
      const next = new Set(prev);
      for (const id of ids) {
        if (allOpen) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function replaceOrder(updated: O) {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  }

  // An order that has moved to another tab collapses out of this one first,
  // rather than vanishing and jerking the list up under you.
  function applyOrderUpdate(updated: O) {
    if (tabOf(updated) === activeTab) replaceOrder(updated);
    else exit(updated.id, () => replaceOrder(updated));
  }

  async function send(url: string, method: string, body?: unknown): Promise<Response> {
    return apiFetch(url, {
      method,
      ...(body !== undefined
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    });
  }

  /** Resolves false (having reported why) when the change didn't save. */
  async function patchOrder(orderId: string, patch: Partial<O>): Promise<boolean> {
    try {
      const res = await send(`${basePath}/${orderId}`, "PATCH", patch);
      if (!res.ok) throw new Error("Failed to update order");
      applyOrderUpdate(await res.json());
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      return false;
    }
  }

  function withOrder(orderId: string, act: (order: O) => void) {
    const order = orders.find((o) => o.id === orderId);
    if (order) act(order);
  }

  function deleteOrder(orderId: string, cadetName: string) {
    confirm(`Delete the entire order for ${cadetName}? This cannot be undone.`, async () => {
      try {
        const res = await send(`${basePath}/${orderId}`, "DELETE");
        if (!res.ok) throw new Error("Failed to delete order");
        exit(orderId, () => {
          setOrders((prev) => prev.filter((o) => o.id !== orderId));
          setExpandedIds((prev) => {
            const next = new Set(prev);
            next.delete(orderId);
            return next;
          });
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Unknown error");
      }
    });
  }

  /** `label` is how the item reads in the question, quotes and all. */
  function deleteItem(orderId: string, itemId: string, label: string) {
    confirm(`Remove ${label} from this order?`, () =>
      withOrder(orderId, (order) =>
        patchOrder(orderId, { items: order.items.filter((i) => i.id !== itemId) } as Partial<O>)
      )
    );
  }

  function updateItem(order: O, itemId: string, change: (item: I) => I) {
    return patchOrder(order.id, {
      items: order.items.map((i) => (i.id === itemId ? change(i) : i)),
    } as Partial<O>);
  }

  async function addNote(orderId: string, itemId: string, content: string) {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const note: QmNote = {
      id: crypto.randomUUID(),
      content,
      timestamp: new Date().toISOString(),
      addedBy: currentUser,
    };
    const saved = await updateItem(order, itemId, (i) => ({ ...i, qmNotes: [...(i.qmNotes ?? []), note] }));
    // Rejecting keeps the note's editor open with what was typed.
    if (!saved) throw new Error("Failed to update order");
  }

  function deleteNote(orderId: string, itemId: string, noteId: string) {
    confirm("Delete this QM note? This cannot be undone.", () =>
      withOrder(orderId, (order) =>
        updateItem(order, itemId, (i) => ({
          ...i,
          qmNotes: (i.qmNotes ?? []).filter((n) => n.id !== noteId),
        }))
      )
    );
  }

  function completeOrder(orderId: string, cadetName: string) {
    confirm(`Mark the order for ${cadetName} as complete? It will move to Completed Orders.`, () =>
      patchOrder(orderId, { completed: true } as Partial<O>)
    );
  }

  function reopenOrder(orderId: string, cadetName: string) {
    confirm(`Reopen the order for ${cadetName}? It will return to Active Orders.`, () =>
      patchOrder(orderId, { completed: false } as Partial<O>)
    );
  }

  async function markReady(orderId: string, itemId: string) {
    setMarkingAsReady(itemId);
    try {
      const res = await send(`${basePath}/${orderId}/items/${itemId}/mark-ready`, "POST");
      if (!res.ok) throw new Error("Failed to mark as ready to collect");
      // The API answers with the updated order — reloading everything instead
      // flashed the whole page to skeletons and lost your scroll position.
      replaceOrder(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setMarkingAsReady(null);
    }
  }

  /**
   * POST to one of an item's own actions (`stock`, `mark-given`, `undo-given`).
   * Returns the parsed answer, or null after reporting why it failed.
   */
  async function itemAction<T>(
    orderId: string,
    itemId: string,
    verb: string,
    body: unknown,
    failure: string
  ) {
    try {
      const res = await send(`${basePath}/${orderId}/items/${itemId}/${verb}`, "POST", body);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorDetail(data) ?? failure);
      return data as T;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      return null;
    }
  }

  // The backend adjusts the stock count and appends to the item's stock history
  // together, so the count and the history can't disagree. Returns the answer
  // ({order, ...the page's stock}) so the page can update its own stock.
  async function stockAction<T extends { order: O }>(
    orderId: string,
    itemId: string,
    body: Record<string, unknown>
  ): Promise<T | null> {
    setRemovingStock(itemId);
    try {
      const data = await itemAction<T>(
        orderId,
        itemId,
        "stock",
        { ...body, by: currentUser },
        "Failed to update stock"
      );
      if (data) replaceOrder(data.order);
      return data;
    } finally {
      setRemovingStock(null);
    }
  }

  return {
    orders,
    setOrders,
    loading: query.isPending && !query.error,
    error,
    setError,
    // A reload starts from a clean slate: an old action's error doesn't linger.
    reload: () => {
      setError(null);
      return query.refetch();
    },
    expandedIds,
    setExpandedIds,
    toggleExpand,
    toggleExpandAll,
    replaceOrder,
    applyOrderUpdate,
    patchOrder,
    deleteOrder,
    deleteItem,
    updateItem,
    addNote,
    deleteNote,
    completeOrder,
    reopenOrder,
    markReady,
    markingAsReady,
    itemAction,
    stockAction,
    removingStock,
  };
}

const EMPTY: never[] = [];
