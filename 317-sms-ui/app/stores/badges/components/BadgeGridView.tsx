"use client";

import React from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BadgeCell, BadgeGrid, BadgeItem } from "@/lib/stores-types";

function BadgeCellCard({
  cell,
  onAddItem,
  onEditItem,
  onDeleteItem,
}: {
  cell: BadgeCell;
  onAddItem: (cellId: number) => void;
  onEditItem: (item: BadgeItem, cellId: number) => void;
  onDeleteItem: (itemId: number) => void;
}) {
  const [deleteItemConfirm, setDeleteItemConfirm] = useState<number | null>(null);

  return (
    <div className="flex flex-col rounded-lg border bg-card shadow-sm w-full h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-1 border-b px-2 py-1.5">
        <div className="w-4" />
        <span className="flex-1 truncate text-center text-xs font-semibold">
          {cell.label ?? "Section"}
        </span>
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
      <div className="flex-1 overflow-y-auto p-2 space-y-1" style={{ maxHeight: 200 }}>
        {cell.items.length === 0 ? (
          <p className="py-1 text-center text-xs text-muted-foreground/60">Empty</p>
        ) : (
          cell.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-1">
              <span className="truncate text-xs">{item.name}</span>
              <div className="flex shrink-0 items-center gap-0.5">
                <Badge variant="secondary" className="text-xs px-1">×{item.quantity}</Badge>
                {deleteItemConfirm === item.id ? (
                  <>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-5 px-1 text-xs"
                      onClick={() => { setDeleteItemConfirm(null); onDeleteItem(item.id); }}
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
                      className="h-5 w-5 text-destructive hover:text-destructive"
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
  onAddItem: (cellId: number) => void;
  onEditItem: (item: BadgeItem, cellId: number) => void;
  onDeleteItem: (itemId: number) => void;
}

export function BadgeGridView({
  grid,
  onAddItem,
  onEditItem,
  onDeleteItem,
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
        <div key={`ch-${c}`} className="flex items-center justify-center">
          <span className="text-xs font-medium text-muted-foreground">{c + 1}</span>
        </div>
      ))}

      {/* Rows */}
      {rows.map((r) => (
        <React.Fragment key={`row-${r}`}>
          {/* Row label */}
          <div className="flex items-center justify-center">
            <span className="text-xs font-medium text-muted-foreground">{r + 1}</span>
          </div>

          {/* Cells */}
          {cols.map((c) => {
            const cell = cellAt(r, c);
            return (
              <div key={`cell-${r}-${c}`} style={{ minHeight: 100 }}>
                {cell ? (
                  <BadgeCellCard
                    cell={cell}
                    onAddItem={onAddItem}
                    onEditItem={onEditItem}
                    onDeleteItem={onDeleteItem}
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
