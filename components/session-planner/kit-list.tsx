"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Package, Plus } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-dialog";
import { DataTable, dataTableColumns } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { KitDialog } from "@/components/session-planner/kit-dialog";
import { Button } from "@/components/ui/button";
import { deleteKit, saveKit, type KitForm, type KitItem } from "@/lib/session-planner";

const col = dataTableColumns<KitItem>();

function columns(onOpen: (k: KitItem) => void) {
  return col.columns([
    col.accessor("name", {
      header: "Kit",
      sortFn: "text",
      cell: ({ row }) => {
        const k = row.original;
        return (
          <button
            type="button"
            className="flex min-w-0 flex-col items-start text-left"
            onClick={() => onOpen(k)}
          >
            <span className="font-medium hover:underline">{k.name}</span>
            {k.notes && <span className="text-muted-foreground text-xs">{k.notes}</span>}
          </button>
        );
      },
    }),
    col.accessor("quantity", {
      header: "Have",
      sortFn: "basic",
      cell: ({ getValue }) =>
        getValue() === 0 ? <span className="text-warning">None working</span> : getValue(),
    }),
    col.accessor((k) => k.used_by.length, {
      id: "used",
      header: "Needed by",
      sortFn: "basic",
      cell: ({ row }) =>
        row.original.used_by.length ? (
          row.original.used_by.map((u) => u.name).join(", ")
        ) : (
          <span className="text-muted-foreground">No tasks</span>
        ),
    }),
  ]);
}

/**
 * The kit list tab: what the squadron owns for running sessions and which
 * tasks need it. The quantities are what decides which tasks can run side by
 * side in one round.
 */
export function KitList({ kit, onChanged }: { kit: KitItem[]; onChanged: () => void }) {
  const { data: session } = useSession();
  const token = session?.id_token ?? "";
  const { confirm, confirmDialog } = useConfirm();
  const [editing, setEditing] = useState<KitItem | null>(null);
  const [open, setOpen] = useState(false);
  // A fresh dialog each time it opens, so it starts from what was clicked.
  const [opened, setOpened] = useState(0);
  const cols = useMemo(
    () =>
      columns((k) => {
        setEditing(k);
        setOpened((n) => n + 1);
        setOpen(true);
      }),
    []
  );

  async function save(values: KitForm) {
    const saved = await saveKit(token, values, editing?.id);
    toast.success(editing ? `${saved.name} saved` : `${saved.name} added`);
    setOpen(false);
    onChanged();
  }

  function remove(item: KitItem) {
    confirm(`Delete ${item.name} from the kit list?`, async () => {
      try {
        await deleteKit(token, item.id);
        toast.success(`${item.name} deleted`);
        setOpen(false);
        onChanged();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't delete the kit.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null);
            setOpened((n) => n + 1);
            setOpen(true);
          }}
        >
          <Plus />
          Add kit
        </Button>
      </div>

      {kit.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No kit on the list"
          description="Add what you run sessions with (planks, barrels, radios) and how many you have."
        />
      ) : (
        <DataTable
          label="Kit list"
          data={kit}
          columns={cols}
          rowKey={(k) => k.id}
          initialSort={{ id: "name" }}
          columnClassName={{ used: "hidden sm:table-cell" }}
        />
      )}

      <KitDialog
        key={opened}
        open={open}
        onOpenChange={setOpen}
        kit={editing}
        onSave={save}
        onDelete={editing ? () => remove(editing) : undefined}
      />
      {confirmDialog}
    </div>
  );
}
