"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShelfBox, StockItem } from "@/lib/stores-types";
import { useState } from "react";

interface BoxCardProps {
  box: ShelfBox;
  stock: StockItem[];
  onClick: () => void;
  overlay?: boolean;
  editMode?: boolean;
  isMisc?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDeleteBox?: () => void;
  onRename?: (newLabel: string) => void;
}

export function BoxCard({
  box,
  stock,
  onClick,
  overlay = false,
  editMode = false,
  isMisc = false,
  onMoveUp,
  onMoveDown,
  onDeleteBox,
  onRename,
}: BoxCardProps) {
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(box.label);

  function submitRename() {
    const next = renameValue.trim().toUpperCase();
    if (next && next !== box.label) onRename?.(next);
    setRenameOpen(false);
  }
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `box-${box.label}`,
      data: { box },
      disabled: !editMode,
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    cursor: overlay ? "grabbing" : editMode ? "grab" : "pointer",
  };

  const totalQty = stock
    .filter((i) => i.box === box.label)
    .reduce((s, i) => s + i.quantity, 0);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex flex-col gap-1 rounded-lg border bg-card p-3 shadow-sm select-none w-full h-full ${
        overlay
          ? "shadow-lg ring-2 ring-primary"
          : editMode
          ? "border-dashed border-primary/40 bg-primary/5"
          : "hover:border-primary/50 transition-colors"
      }`}
      {...(editMode ? attributes : {})}
    >
      {editMode && (
        <>
          {/* Drag handle — centred */}
          <div
            {...listeners}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted cursor-grab active:cursor-grabbing transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-5 w-5" />
          </div>

          {/* Rename — top-left */}
          {onRename && (
            <div className="absolute top-1 left-1" onClick={(e) => e.stopPropagation()}>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                title={isMisc ? "Rename area" : "Rename box"}
                onClick={() => { setRenameValue(box.label); setRenameOpen(true); }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* Rename dialog */}
          <Dialog open={renameOpen} onOpenChange={(o) => { if (!o) setRenameOpen(false); }}>
            <DialogContent className="sm:max-w-xs">
              <DialogHeader>
                <DialogTitle>Rename {isMisc ? "Area" : "Box"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor={`rename-box-${box.label}`}>Label</Label>
                <Input
                  id={`rename-box-${box.label}`}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === "Enter") submitRename(); }}
                  maxLength={isMisc ? 20 : 10}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
                <Button onClick={submitRename} disabled={!renameValue.trim() || renameValue.trim().toUpperCase() === box.label}>
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Arrow up — top-right */}
          <div className="absolute top-1 right-1" onClick={(e) => e.stopPropagation()}>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              title="Move to shelf above"
              disabled={!onMoveUp}
              onClick={onMoveUp}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Arrow down — bottom-right */}
          <div className="absolute bottom-1 right-1" onClick={(e) => e.stopPropagation()}>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              title="Move to shelf below"
              disabled={!onMoveDown}
              onClick={onMoveDown}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Delete box — bottom-left */}
          {onDeleteBox && (
            <div className="absolute bottom-1 left-1" onClick={(e) => e.stopPropagation()}>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive/60 hover:text-destructive"
                title="Delete box"
                onClick={() => setDeleteConfirm(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* Delete confirm dialog */}
          <Dialog open={deleteConfirm} onOpenChange={(o) => { if (!o) setDeleteConfirm(false); }}>
            <DialogContent className="sm:max-w-xs">
              <DialogHeader>
                <DialogTitle>Delete {isMisc ? box.label : `Box ${box.label}`}?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete {isMisc ? box.label : `box ${box.label}`}?
                All sections and their stock will be permanently removed. This cannot be undone.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteConfirm(false)}>Cancel</Button>
                <Button variant="destructive" onClick={() => { setDeleteConfirm(false); onDeleteBox?.(); }}>
                  Delete {isMisc ? "Area" : "Box"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Content — not clickable in edit mode */}
      {editMode ? (
        <div className="text-left w-full pointer-events-none opacity-50">
          <p className="text-lg font-bold leading-none">{isMisc ? box.label : `Box ${box.label}`}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {box.sections.length} section{box.sections.length !== 1 ? "s" : ""}
          </p>
          <p className="text-xs text-muted-foreground">{totalQty} items</p>
        </div>
      ) : (
        <button className="cursor-pointer text-left w-full" onClick={onClick} tabIndex={0}>
          <p className="text-lg font-bold leading-none">{isMisc ? box.label : `Box ${box.label}`}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {box.sections.length} section{box.sections.length !== 1 ? "s" : ""}
          </p>
          <p className="text-xs text-muted-foreground">{totalQty} items</p>
        </button>
      )}
    </div>
  );
}
