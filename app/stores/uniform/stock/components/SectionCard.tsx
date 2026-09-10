"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BoxSection, StockItem } from "@/lib/stores-types";
import { useState } from "react";

interface SectionCardProps {
  boxLabel: string;
  section: BoxSection;
  items: StockItem[];
  onAddItem: (box: string, section: string) => void;
  onEditItem: (item: StockItem) => void;
  onDeleteItem: (id: string) => void;
  onDeleteSection: (box: string, section: string) => void;
  onRenameSection: (box: string, section: string, newLabel: string) => void;
  deleteItemConfirm: string | null;
  onDeleteItemConfirm: (id: string | null) => void;
  editMode: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export function SectionCard({
  boxLabel,
  section,
  items,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onDeleteSection,
  onRenameSection,
  deleteItemConfirm,
  onDeleteItemConfirm,
  editMode,
  onMoveUp,
  onMoveDown,
}: SectionCardProps) {
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(section.label);

  function submitRename() {
    const next = renameValue.trim();
    if (next && next !== section.label) onRenameSection(boxLabel, section.label, next);
    setRenameOpen(false);
  }

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.label, disabled: !editMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col rounded-lg border bg-card shadow-sm w-full h-full"
    >
      {/* Section header */}
      <div className="flex items-center justify-between gap-1 border-b px-3 py-2">
        {editMode ? (
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground shrink-0"
          >
            <GripHorizontal className="h-4 w-4" />
          </div>
        ) : (
          <div className="w-4 shrink-0" />
        )}

        <span className="flex-1 text-center text-sm font-semibold truncate">
          Section {section.label}
        </span>

        <div className="flex items-center gap-0.5 shrink-0">
          {/* Row move buttons — editMode only */}
          {editMode && (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                title="Move to row above"
                disabled={!onMoveUp}
                onClick={onMoveUp}
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                title="Move to row below"
                onClick={onMoveDown}
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
            </>
          )}

          {editMode && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              title="Rename section"
              onClick={() => { setRenameValue(section.label); setRenameOpen(true); }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}

          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            title="Add item"
            onClick={() => onAddItem(boxLabel, section.label)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          {editMode && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-destructive hover:text-destructive"
              title="Delete section"
              onClick={() => setDeleteConfirm(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Rename section dialog */}
      <Dialog open={renameOpen} onOpenChange={(o) => { if (!o) setRenameOpen(false); }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Rename Section</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`rename-section-${section.label}`}>Name</Label>
            <Input
              id={`rename-section-${section.label}`}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitRename(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button onClick={submitRename} disabled={!renameValue.trim() || renameValue.trim() === section.label}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete section confirm dialog */}
      <Dialog open={deleteConfirm} onOpenChange={(o) => { if (!o) setDeleteConfirm(false); }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Delete Section {section.label}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete section {section.label}?
            {items.length > 0 && ` ${items.length} item${items.length !== 1 ? "s" : ""} will be removed.`}
            {" "}This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { setDeleteConfirm(false); onDeleteSection(boxLabel, section.label); }}>
              Delete Section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5" style={{ maxHeight: "280px" }}>
        {items.length === 0 ? (
          <p className="py-2 text-center text-xs text-muted-foreground">Empty</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-1">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.itemType}</p>
                <p className="text-sm text-muted-foreground">{item.size}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Badge variant="secondary" className="text-xs px-1">
                  ×{item.quantity}
                </Badge>
                {deleteItemConfirm === item.id ? (
                  <>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-6 px-1.5 text-xs"
                      onClick={() => onDeleteItem(item.id)}
                    >
                      ✓
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-xs"
                      onClick={() => onDeleteItemConfirm(null)}
                    >
                      ✕
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => onEditItem(item)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => onDeleteItemConfirm(item.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
