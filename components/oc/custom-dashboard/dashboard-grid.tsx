"use client";

import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { Copy, GripVertical, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import {
  type Dataset,
  type Panel,
  GRID_COLS,
  applyLayout,
  describeQuery,
  layoutChanged,
  readingOrder,
} from "@/lib/custom-dashboard";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PanelView } from "@/components/oc/custom-dashboard/panel-view";

// Below this the grid's 12 columns are too narrow to read, so panels stack
// in reading order instead, the way every other dashboard does on a phone.
const GRID_MIN_WIDTH = 768;
const ROW_HEIGHT = 56;

/**
 * The custom dashboard's panels on a 12-column grid (react-grid-layout).
 * While editing, a panel moves by its grip and resizes from its corner;
 * the new boxes go to `onLayout` once a drag or resize ends, never mid-drag,
 * so a save is one request per move.
 */
export function DashboardGrid({
  panels,
  datasets,
  rangeDays,
  editing,
  onLayout,
  onEdit,
  onDuplicate,
  onRemove,
}: {
  panels: Panel[];
  datasets: Dataset[];
  rangeDays: number | null;
  editing: boolean;
  onLayout: (panels: Panel[]) => void;
  onEdit: (panel: Panel) => void;
  onDuplicate: (panel: Panel) => void;
  onRemove: (panel: Panel) => void;
}) {
  const { width, containerRef, mounted } = useContainerWidth();
  const datasetOf = (p: Panel) => datasets.find((d) => d.key === p.query.dataset);
  const card = (p: Panel) => (
    <PanelCard
      panel={p}
      dataset={datasetOf(p)}
      rangeDays={rangeDays}
      editing={editing}
      onEdit={() => onEdit(p)}
      onDuplicate={() => onDuplicate(p)}
      onRemove={() => onRemove(p)}
    />
  );

  const stacked = mounted && width < GRID_MIN_WIDTH;
  const layout: Layout = panels.map((p) => ({ i: p.id, x: p.x, y: p.y, w: p.w, h: p.h, minW: 2, minH: 2 }));
  const commit = (next: Layout) => {
    const updated = applyLayout(panels, next);
    if (layoutChanged(panels, updated)) onLayout(updated);
  };

  return (
    <div ref={containerRef} className="custom-dashboard-grid">
      {stacked ? (
        <ul className="flex flex-col gap-4" aria-label="Panels">
          {readingOrder(panels).map((p) => (
            <li key={p.id} className={p.viz === "stat" ? "" : "h-80"}>
              {card(p)}
            </li>
          ))}
        </ul>
      ) : (
        mounted && (
          <ReactGridLayout
            layout={layout}
            width={width}
            gridConfig={{
              cols: GRID_COLS,
              rowHeight: ROW_HEIGHT,
              margin: [16, 16],
              containerPadding: [0, 0],
            }}
            dragConfig={{ enabled: editing, handle: ".panel-drag-handle" }}
            resizeConfig={{ enabled: editing, handles: ["se"] }}
            onDragStop={(next) => commit(next)}
            onResizeStop={(next) => commit(next)}
            className={cn(editing && "is-editing")}
          >
            {panels.map((p) => (
              <div key={p.id}>{card(p)}</div>
            ))}
          </ReactGridLayout>
        )
      )}
    </div>
  );
}

function PanelCard({
  panel,
  dataset,
  rangeDays,
  editing,
  onEdit,
  onDuplicate,
  onRemove,
}: {
  panel: Panel;
  dataset: Dataset | undefined;
  rangeDays: number | null;
  editing: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  return (
    <article
      aria-label={panel.title}
      className={cn(
        "bg-card flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-lg border p-3 sm:p-4",
        editing && "border-dashed"
      )}
    >
      <header className="flex items-start gap-2">
        {editing && (
          <span
            className="panel-drag-handle text-muted-foreground -ml-1 flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md active:cursor-grabbing"
            aria-hidden
            title="Drag to move"
          >
            <GripVertical className="size-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{panel.title}</h2>
          <p className="text-muted-foreground truncate text-xs">{describeQuery(panel.query, dataset)}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-1 size-8 shrink-0"
              aria-label={`${panel.title} options`}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}>
              <Copy />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              <Trash2 />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelView query={panel.query} viz={panel.viz} dataset={dataset} rangeDays={rangeDays} />
      </div>
    </article>
  );
}
