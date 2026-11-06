"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertTriangle, ListChecks, Plus } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-dialog";
import { DataTable, dataTableColumns } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { TaskDialog } from "@/components/session-planner/task-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  deleteTask,
  groupSizeLabel,
  kindLabel,
  kitSummary,
  saveTask,
  SESSION_KINDS,
  type BankTask,
  type KitItem,
  type SessionKind,
  type TaskForm,
} from "@/lib/session-planner";

const col = dataTableColumns<BankTask>();

function columns(onOpen: (t: BankTask) => void) {
  return col.columns([
    // Kind by kind, then numbered tasks in number order (2 before 10), then
    // the unnumbered ones by name: the order the API lists them.
    col.accessor(
      (t) => `${SESSION_KINDS.indexOf(t.kind)} ${(t.number ?? "~").padStart(4, "0")} ${t.name.toLowerCase()}`,
      {
        id: "task",
        header: "Task",
        sortFn: "text",
        cell: ({ row }) => {
          const t = row.original;
          return (
            <button
              type="button"
              className="flex min-w-0 flex-col items-start text-left"
              onClick={() => onOpen(t)}
            >
              <span className="font-medium hover:underline">
                {t.number && <span className="text-muted-foreground">{t.number}. </span>}
                {t.name}
              </span>
              <span className="text-muted-foreground text-xs">
                {kindLabel(t.kind)}
                {!t.active && " · retired"}
              </span>
              {/* The Kit column is hidden on a phone; the shortage mustn't be. */}
              {t.kit_short.length > 0 && (
                <span className="text-warning text-xs md:hidden">Not enough kit</span>
              )}
            </button>
          );
        },
      }
    ),
    col.accessor("duration_minutes", {
      header: "Time",
      sortFn: "basic",
      cell: ({ getValue }) => `${getValue()} min`,
    }),
    col.accessor((t) => t.max_group ?? t.min_group ?? 0, {
      id: "group",
      header: "Group",
      sortFn: "basic",
      cell: ({ row }) => groupSizeLabel(row.original.min_group, row.original.max_group),
    }),
    col.accessor((t) => t.kit.length, {
      id: "kit",
      header: "Kit",
      sortFn: "basic",
      cell: ({ row }) => {
        const t = row.original;
        if (t.kit_short.length)
          return (
            <span className="text-warning flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              Not enough {t.kit_short.join(", ")}
            </span>
          );
        return t.kit.length ? kitSummary(t.kit) : <span className="text-muted-foreground">None</span>;
      },
    }),
    col.accessor("led_count", {
      header: "Led",
      sortFn: "basic",
      cell: ({ row }) => {
        const t = row.original;
        if (t.kind !== "leadership") return <span className="text-muted-foreground">–</span>;
        return t.led_count ? `${t.cadets_led} cadet${t.cadets_led === 1 ? "" : "s"}` : "Nobody yet";
      },
    }),
  ]);
}

/**
 * The task bank tab: every task a session can run, narrowed by kind, with its
 * time, group size, kit and (for leadership) how many cadets have led it. A
 * task opens in the edit dialog from its name.
 */
export function TaskBank({
  tasks,
  kit,
  onChanged,
}: {
  tasks: BankTask[];
  kit: KitItem[];
  onChanged: () => void;
}) {
  const { data: session } = useSession();
  const token = session?.id_token ?? "";
  const { confirm, confirmDialog } = useConfirm();
  const [kind, setKind] = useState<SessionKind | "">("");
  const [showRetired, setShowRetired] = useState(false);
  const [editing, setEditing] = useState<BankTask | null>(null);
  const [open, setOpen] = useState(false);
  // A fresh dialog each time it opens, so it starts from what was clicked.
  const [opened, setOpened] = useState(0);

  const kinds = SESSION_KINDS.filter((k) => tasks.some((t) => t.kind === k));
  const shown = tasks.filter((t) => (!kind || t.kind === kind) && (showRetired || t.active));
  const retired = tasks.filter((t) => !t.active && (!kind || t.kind === kind)).length;
  const cols = useMemo(
    () =>
      columns((t) => {
        setEditing(t);
        setOpened((n) => n + 1);
        setOpen(true);
      }),
    []
  );

  async function save(values: TaskForm) {
    const saved = await saveTask(token, values, editing?.id);
    toast.success(editing ? `${saved.name} saved` : `${saved.name} added to the bank`);
    setOpen(false);
    onChanged();
  }

  function remove(task: BankTask) {
    confirm(`Delete ${task.name} from the bank?`, async () => {
      try {
        await deleteTask(token, task.id);
        toast.success(`${task.name} deleted`);
        setOpen(false);
        onChanged();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't delete the task.");
      }
    });
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="tasks-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="tasks-heading" className="text-base font-semibold">
          Tasks
        </h2>
        <Button
          onClick={() => {
            setEditing(null);
            setOpened((n) => n + 1);
            setOpen(true);
          }}
        >
          <Plus />
          Add task
        </Button>
      </div>

      {(kinds.length > 1 || retired > 0) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {kinds.length > 1 && (
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              aria-label="Filter by kind of session"
              className="flex-wrap"
              value={kind || "all"}
              onValueChange={(v) => setKind(v === "all" || v === "" ? "" : (v as SessionKind))}
            >
              <ToggleGroupItem value="all" className="px-3">
                All
              </ToggleGroupItem>
              {kinds.map((k) => (
                <ToggleGroupItem key={k} value={k} className="px-3">
                  {kindLabel(k)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          {retired > 0 && (
            <div className="flex items-center gap-2">
              <Switch id="show-retired" checked={showRetired} onCheckedChange={setShowRetired} />
              <Label htmlFor="show-retired">Show {retired} retired</Label>
            </div>
          )}
        </div>
      )}

      {tasks.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No tasks yet"
          description="Add the command tasks and stands your sessions run. Leadership assessments pick from them."
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Nothing to show"
          description="No tasks of this kind are in use."
        />
      ) : (
        <DataTable
          label="Task bank"
          data={shown}
          columns={cols}
          rowKey={(t) => t.id}
          initialSort={{ id: "task" }}
          columnClassName={{ group: "hidden sm:table-cell", kit: "hidden md:table-cell" }}
        />
      )}

      {kind === "" && shown.some((t) => t.kit_short.length) && (
        <p className="text-muted-foreground text-sm">
          <Badge variant="outline" className="border-warning/40 text-warning mr-1.5">
            Short of kit
          </Badge>
          Some tasks need more kit than the list has, so the planner won&apos;t pick them.
        </p>
      )}

      <TaskDialog
        key={opened}
        open={open}
        onOpenChange={setOpen}
        task={editing}
        kitList={kit}
        defaultKind={kind || undefined}
        onSave={save}
        onDelete={editing ? () => remove(editing) : undefined}
      />
      {confirmDialog}
    </section>
  );
}
