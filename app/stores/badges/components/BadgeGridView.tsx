"use client";

import React, { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BadgeCell, BadgeGrid, BadgeItem } from "@/lib/stores-types";

function BadgeCellCard({
  cell,
  editMode,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onRenameCell,
}: {
  cell: BadgeCell;
  editMode: boolean;
  onAddItem: (cellId: number) => void;
  onEditItem: (item: BadgeItem, cellId: number) => void;
  onDeleteItem: (itemId: number) => void;
  onRenameCell: (cellId: number, label: string) => void;
}) {
  const [deleteItemConfirm, setDeleteItemConfirm] = useState<number | null>(null);
  const [labelDraft, setLabelDraft] = useState(cell.label ?? "");

  function commitLabel() {
    const trimmed = labelDraft.trim();
    if (trimmed !== (cell.label ?? "")) {
      onRenameCell(cell.id, trimmed);
    }
  }

  return (
    <div className="bg-card flex h-full w-full flex-col rounded-lg border shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-1 border-b px-2 py-1.5">
        <div className="w-4" />
        {editMode ? (
          <Input
            className="h-6 flex-1 px-1 py-0 text-center text-xs font-semibold"
            value={labelDraft}
            placeholder="Section name…"
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
          />
        ) : (
          <span className="flex-1 truncate text-center text-xs font-semibold">{cell.label ?? ""}</span>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          title="Add badge"
          onClick={() => onAddItem(cell.id)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Items */}
      <div className="flex-1 space-y-1 overflow-y-auto p-2" style={{ maxHeight: 200 }}>
        {cell.items.length === 0 ? (
          <p className="text-muted-foreground/60 py-1 text-center text-xs">Empty</p>
        ) : (
          cell.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-1">
              <span className="truncate text-xs">{item.name}</span>
              <div className="flex shrink-0 items-center gap-0.5">
                <Badge variant="secondary" className="px-1 text-xs">
                  ×{item.quantity}
                </Badge>
                {deleteItemConfirm === item.id ? (
                  <>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-5 px-1 text-xs"
                      onClick={() => {
                        setDeleteItemConfirm(null);
                        onDeleteItem(item.id);
                      }}
                    >
                      ✓
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-1 text-xs"
                      onClick={() => setDeleteItemConfirm(null)}
                    >
                      ✕
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5"
                      onClick={() => onEditItem(item, cell.id)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive h-5 w-5"
                      onClick={() => setDeleteItemConfirm(item.id)}
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

interface BadgeGridViewProps {
  grid: BadgeGrid;
  editMode: boolean;
  onAddItem: (cellId: number) => void;
  onEditItem: (item: BadgeItem, cellId: number) => void;
  onDeleteItem: (itemId: number) => void;
  onDeleteRow: (rowIndex: number) => void;
  onDeleteCol: (colIndex: number) => void;
  onRenameCell: (cellId: number, label: string) => void;
}

export function BadgeGridView({
  grid,
  editMode,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onDeleteRow,
  onDeleteCol,
  onRenameCell,
}: BadgeGridViewProps) {
  const { numRows, numCols } = grid.config;
  const rows = Array.from({ length: numRows }, (_, i) => i);
  const cols = Array.from({ length: numCols }, (_, i) => i);

  function cellAt(row: number, col: number): BadgeCell | undefined {
    return grid.cells.find((c) => c.row === row && c.col === col);
  }

  return (
    <div
      className="overflow-auto"
      style={{
        display: "grid",
        gridTemplateColumns: `2.5rem repeat(${numCols}, minmax(120px, 1fr))`,
        gridTemplateRows: `2rem repeat(${numRows}, auto)`,
        gap: "6px",
      }}
    >
      {/* Corner */}
      <div />

      {/* Column headers */}
      {cols.map((c) => (
        <div key={`ch-${c}`} className="flex items-center justify-center gap-1">
          <span className="text-muted-foreground text-xs font-medium">{c + 1}</span>
          {editMode && (
            <Button
              size="icon"
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 h-5 w-5"
              title={`Delete column ${c + 1}`}
              disabled={numCols <= 1}
              onClick={() => onDeleteCol(c)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      ))}

      {/* Rows */}
      {rows.map((r) => (
        <React.Fragment key={`row-${r}`}>
          {/* Row label */}
          <div className="flex flex-col items-center justify-center gap-0.5">
            <span className="text-muted-foreground text-xs font-medium">{r + 1}</span>
            {editMode && (
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-5 w-5"
                title={`Delete row ${r + 1}`}
                disabled={numRows <= 1}
                onClick={() => onDeleteRow(r)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Cells */}
          {cols.map((c) => {
            const cell = cellAt(r, c);
            return (
              <div key={`cell-${r}-${c}`} style={{ minHeight: 100 }}>
                {cell ? (
                  <BadgeCellCard
                    key={`${cell.id}-${cell.label}`}
                    cell={cell}
                    editMode={editMode}
                    onAddItem={onAddItem}
                    onEditItem={onEditItem}
                    onDeleteItem={onDeleteItem}
                    onRenameCell={onRenameCell}
                  />
                ) : (
                  <div className="h-full rounded-lg" style={{ minHeight: 100 }} />
                )}
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}
