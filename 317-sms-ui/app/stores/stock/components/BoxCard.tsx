"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShelfBox, StockItem } from "@/lib/stores-types";

interface BoxCardProps {
  box: ShelfBox;
  stock: StockItem[];
  onClick: () => void;
  overlay?: boolean;
  editMode?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export function BoxCard({
  box,
  stock,
  onClick,
  overlay = false,
  editMode = false,
  onMoveUp,
  onMoveDown,
}: BoxCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `box-${box.label}`,
      data: { box },
      disabled: !editMode,
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    cursor: overlay ? "grabbing" : "default",
  };

  const totalQty = stock
    .filter((i) => i.box === box.label)
    .reduce((s, i) => s + i.quantity, 0);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex flex-col gap-1 rounded-lg border bg-card p-3 shadow-sm select-none w-full ${
        overlay
          ? "shadow-lg ring-2 ring-primary"
          : "hover:border-primary/50 transition-colors"
      }`}
      {...(editMode ? attributes : {})}
    >
      {/* Edit mode controls */}
      {editMode && (
        <div
          className="absolute top-1 right-1 flex flex-col items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            title="Move to shelf above"
            disabled={!onMoveUp}
            onClick={onMoveUp}
          >
            <ArrowUp className="h-3 w-3" />
          </Button>
          <div
            {...listeners}
            className="text-muted-foreground/50 hover:text-muted-foreground cursor-grab flex items-center justify-center h-5 w-5"
          >
            <GripVertical className="h-4 w-4" />
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            title="Move to shelf below"
            disabled={!onMoveDown}
            onClick={onMoveDown}
          >
            <ArrowDown className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Clickable content */}
      <button className="text-left w-full pr-7" onClick={onClick} tabIndex={0}>
        <p className="text-lg font-bold leading-none">Box {box.label}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {box.sections.length} section{box.sections.length !== 1 ? "s" : ""}
        </p>
        <p className="text-xs text-muted-foreground">{totalQty} items</p>
      </button>
    </div>
  );
}
