"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { ListPlus, Plus } from "lucide-react";
import { toast } from "sonner";

import { BadgeDialog } from "@/components/catalogue/badge-dialog";
import { EntryList } from "@/components/catalogue/entry-list";
import { ItemDialog } from "@/components/catalogue/item-dialog";
import { useConfirm } from "@/components/confirm-dialog";
import { CountTabs } from "@/components/count-tabs";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  badgeSummary,
  BADGES_KEY,
  type CatalogueBadge,
  type CatalogueItem,
  deleteBadge,
  deleteItem,
  ITEMS_KEY,
  itemSummary,
  moved,
  reorderBadges,
  reorderItems,
  setBadgeActive,
  setItemActive,
} from "@/lib/catalogue";
import { useApiQuery } from "@/lib/use-api-query";

type Tab = "uniform" | "badges";

/** `null` = adding; undefined = closed. */
type Editing<T> = T | null | undefined;

export default function CataloguePage() {
  const { data: session } = useSession();
  const token = session?.id_token ?? "";
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [tab, setTab] = useState<Tab>("uniform");
  const [item, setItem] = useState<Editing<CatalogueItem>>(undefined);
  const [badge, setBadge] = useState<Editing<CatalogueBadge>>(undefined);
  const [busy, setBusy] = useState(false);

  const items = useApiQuery<CatalogueItem[]>(ITEMS_KEY, "/catalogue/uniform");
  const badges = useApiQuery<CatalogueBadge[]>(BADGES_KEY, "/catalogue/badges");

  // The pickers on every other page read /reference, and the insights page reads
  // the levels, so anything saved here makes them stale.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["catalogue"] }),
      queryClient.invalidateQueries({ queryKey: ["reference"] }),
      queryClient.invalidateQueries({ queryKey: ["stores-insights"] }),
    ]);

  /** Run a write, report its refusal as it came from the API, and reload the lists. */
  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the catalogue.");
    } finally {
      await refresh();
      setBusy(false);
    }
  }

  const itemRows = items.data ?? [];
  const badgeRows = badges.data ?? [];
  const lines = [...new Set(itemRows.filter((i) => i.active).map((i) => i.issuanceCategory ?? i.name))];

  const loading = tab === "uniform" ? items : badges;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Catalogue"
        description="The uniform items, sizes and badges the stock and order forms offer."
        actions={
          <Button onClick={() => (tab === "uniform" ? setItem(null) : setBadge(null))}>
            <Plus />
            {tab === "uniform" ? "Add item" : "Add category"}
          </Button>
        }
      />

      <CountTabs<Tab>
        value={tab}
        onValueChange={setTab}
        loading={items.isPending || badges.isPending}
        tabs={[
          { value: "uniform", label: "Uniform", count: itemRows.filter((i) => i.active).length },
          { value: "badges", label: "Badges", count: badgeRows.filter((b) => b.active).length },
        ]}
      />

      <ErrorAlert title="Couldn't load the catalogue" message={loading.error?.message} />
      {loading.isPending && !loading.error && <ListSkeleton rows={8} className="h-14" />}

      {tab === "uniform" && items.data && (
        <>
          {itemRows.length === 0 ? (
            <EmptyState
              icon={ListPlus}
              title="No items yet"
              description="Add the first uniform item to stock."
            >
              <Button onClick={() => setItem(null)}>Add item</Button>
            </EmptyState>
          ) : (
            <EntryList
              noun="item"
              busy={busy}
              entries={itemRows.map((i) => ({
                id: i.id,
                title: i.name,
                summary: itemSummary(i),
                retired: !i.active,
              }))}
              onOpen={(id) => setItem(itemRows.find((i) => i.id === id))}
              onMove={(index, by) =>
                run(
                  () =>
                    reorderItems(
                      token,
                      moved(
                        itemRows.map((i) => i.id),
                        index,
                        by
                      )
                    ),
                  "Order saved"
                )
              }
            />
          )}
        </>
      )}

      {tab === "badges" && badges.data && (
        <>
          {badgeRows.length === 0 ? (
            <EmptyState
              icon={ListPlus}
              title="No badge categories yet"
              description="Add one to order badges."
            >
              <Button onClick={() => setBadge(null)}>Add category</Button>
            </EmptyState>
          ) : (
            <EntryList
              noun="category"
              busy={busy}
              entries={badgeRows.map((b) => ({
                id: b.id,
                title: b.name,
                summary: badgeSummary(b),
                retired: !b.active,
              }))}
              onOpen={(id) => setBadge(badgeRows.find((b) => b.id === id))}
              onMove={(index, by) =>
                run(
                  () =>
                    reorderBadges(
                      token,
                      moved(
                        badgeRows.map((b) => b.id),
                        index,
                        by
                      )
                    ),
                  "Order saved"
                )
              }
            />
          )}
        </>
      )}

      <ItemDialog
        item={item ?? null}
        open={item !== undefined}
        onOpenChange={(o) => !o && setItem(undefined)}
        lines={lines}
        onSaved={() => {
          toast.success("Item saved");
          void refresh();
        }}
        onSetActive={(i, active) => {
          setItem(undefined);
          void run(
            () => setItemActive(token, i.id, active),
            active ? `${i.name} restored` : `${i.name} retired`
          );
        }}
        onDelete={(i) => {
          setItem(undefined);
          confirm(
            `Delete ${i.name}? It isn't used anywhere, so nothing else changes.`,
            () => void run(() => deleteItem(token, i.id), `${i.name} deleted`)
          );
        }}
      />
      <BadgeDialog
        badge={badge ?? null}
        open={badge !== undefined}
        onOpenChange={(o) => !o && setBadge(undefined)}
        onSaved={() => {
          toast.success("Category saved");
          void refresh();
        }}
        onSetActive={(b, active) => {
          setBadge(undefined);
          void run(
            () => setBadgeActive(token, b.id, active),
            active ? `${b.name} restored` : `${b.name} retired`
          );
        }}
        onDelete={(b) => {
          setBadge(undefined);
          confirm(
            `Delete ${b.name}? No badge orders use it, so nothing else changes.`,
            () => void run(() => deleteBadge(token, b.id), `${b.name} deleted`)
          );
        }}
      />
      {confirmDialog}
    </div>
  );
}
