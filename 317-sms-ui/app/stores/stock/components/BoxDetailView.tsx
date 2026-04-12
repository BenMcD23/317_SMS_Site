"use client";

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "./SectionCard";
import {
  BoxSection,
  ShelfBox,
  ShelfStructure,
  StockItem,
} from "@/lib/stores-types";
import { useState, useMemo } from "react";

interface BoxDetailViewProps {
  box: ShelfBox;
  stock: StockItem[];
  onBack: () => void;
  onStructureChange: (s: ShelfStructure) => void;
  onAddItem: (box: string, section: string) => void;
  onEditItem: (item: StockItem) => void;
  onDeleteItem: (id: string) => void;
  onDeleteSection: (box: string, section: string) => void;
  onDeleteBox: (box: string) => void;
  onAddSection: (box: string, sectionName: string) => void;
  deleteItemConfirm: string | null;
  onDeleteItemConfirm: (id: string | null) => void;
  deleteBoxConfirm: boolean;
  onDeleteBoxConfirm: (confirm: boolean) => void;
  editMode: boolean;
  isMisc?: boolean;
}

/** Drop zone between rows — expands when dragging, highlights when hovered */
function RowSeparator({
  id,
  isOver,
  isDragging,
  isNew,
}: {
  id: string;
  isOver: boolean;
  isDragging: boolean;
  isNew: boolean;
}) {
  const { setNodeRef } = useDroppable({ id });

  if (!isDragging) {
    return <div ref={setNodeRef} className="h-2" />;
  }

  return (
    <div
      ref={setNodeRef}
      className={`my-1 transition-all rounded-md border-2 border-dashed flex items-center justify-center ${
        isOver
          ? "h-10 border-primary bg-primary/10"
          : "h-6 border-primary/25 bg-primary/5"
      }`}
    >
      {isOver && (
        <span className="text-xs font-medium text-primary">
          {isNew ? "+ New row" : "Move here"}
        </span>
      )}
    </div>
  );
}

export function BoxDetailView({
  box,
  stock,
  onBack,
  onStructureChange,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onDeleteSection,
  onDeleteBox,
  onAddSection,
  deleteItemConfirm,
  onDeleteItemConfirm,
  deleteBoxConfirm,
  onDeleteBoxConfirm,
  editMode,
  isMisc = false,
}: BoxDetailViewProps) {
  const [addSectionValue, setAddSectionValue] = useState<string | null>(null);
  const [widthOverrides, setWidthOverrides] = useState<Record<string, number>>(
    {}
  );
  const [draggingSection, setDraggingSection] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Sort sections by row then position
  const allSections = useMemo(
    () =>
      [...box.sections].sort(
        (a, b) => a.row - b.row || a.position - b.position
      ),
    [box.sections]
  );

  const rowIndexes = useMemo(() => {
    const rows = new Set(allSections.map((s) => s.row));
    return [...rows].sort((a, b) => a - b);
  }, [allSections]);

  const sectionsByRow = (rowIdx: number) =>
    allSections.filter((s) => s.row === rowIdx);

  const getSectionWidth = (s: BoxSection) =>
    widthOverrides[s.label] ?? s.sectionWidth;

  // Send full section arrangement to API
  async function commitSections(updatedSections: BoxSection[]) {
    try {
      const res = await fetch(
        `/api/stores/boxes/${box.label}/sections/reorder`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sections: updatedSections.map((s) => ({
              label: s.label,
              row: s.row,
              position: s.position,
              sectionWidth: widthOverrides[s.label] ?? s.sectionWidth,
            })),
          }),
        }
      );
      if (res.ok) onStructureChange(await res.json());
    } catch {}
  }

  // Move a section to a different row (creates new row if it doesn't exist)
  async function moveSectionToRow(label: string, targetRow: number) {
    if (targetRow < 0) return;
    const section = box.sections.find((s) => s.label === label);
    if (!section || section.row === targetRow) return;

    const srcRow = section.row;
    const srcSiblings = box.sections
      .filter((s) => s.row === srcRow && s.label !== label)
      .sort((a, b) => a.position - b.position);
    const tgtSiblings = box.sections.filter((s) => s.row === targetRow);

    const updated = box.sections.map((s) => {
      if (s.label === label)
        return { ...s, row: targetRow, position: tgtSiblings.length };
      if (s.row === srcRow) {
        const newPos = srcSiblings.findIndex((x) => x.label === s.label);
        return { ...s, position: newPos };
      }
      return { ...s };
    });

    await commitSections(updated);
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggingSection(String(event.active.id));
  }

  function handleDragOver(event: { over: { id: string | number } | null }) {
    setDragOverId(event.over ? String(event.over.id) : null);
  }

  // Within-row drag reorder + cross-row separator drop
  async function handleDragEnd(event: DragEndEvent) {
    setDraggingSection(null);
    setDragOverId(null);

    const { active, over } = event;
    if (!over) return;

    // Check for row separator drop (cross-row move / new row)
    const rowSepMatch = String(over.id).match(/^row-sep-(\d+)$/);
    if (rowSepMatch) {
      const afterRowIdx = parseInt(rowSepMatch[1]);
      const targetRow = afterRowIdx + 1;
      await moveSectionToRow(String(active.id), targetRow);
      return;
    }

    // Within-row sort
    if (active.id === over.id) return;

    const activeLabel = String(active.id);
    const overLabel = String(over.id);

    const activeSection = box.sections.find((s) => s.label === activeLabel);
    const overSection = box.sections.find((s) => s.label === overLabel);

    if (!activeSection || !overSection) return;
    if (activeSection.row !== overSection.row) return;

    const rowSections = sectionsByRow(activeSection.row);
    const oldIdx = rowSections.findIndex((s) => s.label === activeLabel);
    const newIdx = rowSections.findIndex((s) => s.label === overLabel);
    const reordered = arrayMove(rowSections, oldIdx, newIdx);

    const updated = box.sections.map((s) => {
      if (s.row !== activeSection.row) return { ...s };
      const newPos = reordered.findIndex((r) => r.label === s.label);
      return { ...s, position: newPos };
    });

    await commitSections(updated);
  }

  // Section resize via pointer capture
  function startSectionResize(
    e: React.PointerEvent<HTMLDivElement>,
    secA: BoxSection,
    secB: BoxSection
  ) {
    e.preventDefault();
    const el = e.currentTarget as HTMLDivElement;
    el.setPointerCapture(e.pointerId);

    const startWidthA = getSectionWidth(secA);
    const startWidthB = getSectionWidth(secB);
    const startX = e.clientX;
    const rowEl = el.closest("[data-section-row]");
    const rowWidth = rowEl?.getBoundingClientRect().width ?? 800;
    const rowSections = sectionsByRow(secA.row);
    const totalFlex = rowSections.reduce(
      (s, sec) => s + getSectionWidth(sec),
      0
    );
    const flexPerPx = totalFlex / rowWidth;

    function onMove(ev: PointerEvent) {
      const deltaFlex = Math.round((ev.clientX - startX) * flexPerPx);
      setWidthOverrides((prev) => ({
        ...prev,
        [secA.label]: Math.max(20, startWidthA + deltaFlex),
        [secB.label]: Math.max(20, startWidthB - deltaFlex),
      }));
    }

    function onUp(ev: PointerEvent) {
      const deltaFlex = Math.round((ev.clientX - startX) * flexPerPx);
      const newA = Math.max(20, startWidthA + deltaFlex);
      const newB = Math.max(20, startWidthB - deltaFlex);
      el.removeEventListener("pointermove", onMove);

      setWidthOverrides((prev) => ({
        ...prev,
        [secA.label]: newA,
        [secB.label]: newB,
      }));

      const updated = box.sections.map((s) => ({
        label: s.label,
        row: s.row,
        position: s.position,
        sectionWidth:
          s.label === secA.label
            ? newA
            : s.label === secB.label
            ? newB
            : s.sectionWidth,
      }));

      fetch(`/api/stores/boxes/${box.label}/sections/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: updated }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          setWidthOverrides({});
          if (data) onStructureChange(data);
        })
        .catch(() => setWidthOverrides({}));
    }

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp, { once: true });
  }

  const isDraggingSection = draggingSection !== null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ChevronLeft className="h-4 w-4" />
          {isMisc ? "Stock" : "Shelf"}
        </Button>

        <h2 className="text-xl font-bold">{isMisc ? box.label : `Box ${box.label}`}</h2>

        <div className="ml-auto flex items-center gap-2">
          {/* Add section */}
          {addSectionValue === null ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddSectionValue("")}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Section
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                className="h-8 w-32 text-sm"
                placeholder="Section name"
                value={addSectionValue}
                onChange={(e) => setAddSectionValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && addSectionValue.trim()) {
                    onAddSection(box.label, addSectionValue);
                    setAddSectionValue(null);
                  }
                  if (e.key === "Escape") setAddSectionValue(null);
                }}
                autoFocus
              />
              <Button
                size="sm"
                className="h-8"
                disabled={!addSectionValue.trim()}
                onClick={() => {
                  if (addSectionValue.trim()) {
                    onAddSection(box.label, addSectionValue);
                    setAddSectionValue(null);
                  }
                }}
              >
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={() => setAddSectionValue(null)}
              >
                Cancel
              </Button>
            </div>
          )}

          {/* Delete box */}
          {deleteBoxConfirm ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-destructive font-medium">
                Sure?
              </span>
              <Button
                size="sm"
                variant="destructive"
                className="h-8 px-2 text-xs"
                onClick={() => {
                  onDeleteBoxConfirm(false);
                  onDeleteBox(box.label);
                }}
              >
                Delete
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-xs"
                onClick={() => onDeleteBoxConfirm(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDeleteBoxConfirm(true)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {isMisc ? "Delete Area" : "Delete Box"}
            </Button>
          )}
        </div>
      </div>

      {/* Sections area */}
      {allSections.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          No sections yet. Click &ldquo;Add Section&rdquo; above.
        </div>
      ) : (
        <div className="space-y-3">
          {/* TOP label */}
          <div className="px-1">
            <span className="text-xs font-semibold text-primary">▲ TOP</span>
          </div>

          {/* Rows */}
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver as never}
            onDragEnd={handleDragEnd}
          >
            <div className="space-y-0">
              {rowIndexes.map((rowIdx, rIdx) => {
                const rowSections = sectionsByRow(rowIdx);
                const sectionIds = rowSections.map((s) => s.label);
                const isLastRow = rIdx === rowIndexes.length - 1;

                return [
                  <div
                    key={`row-${rowIdx}`}
                    data-section-row={rowIdx}
                    className="overflow-x-auto pb-1"
                  >
                    <SortableContext
                      items={sectionIds}
                      strategy={horizontalListSortingStrategy}
                    >
                      <div className="flex gap-0 w-max min-w-full">
                        {rowSections.map((section, idx) => (
                          <div
                            key={section.label}
                            className="relative flex items-stretch"
                            style={{
                              flex: `${getSectionWidth(section)} 1 210px`,
                              minWidth: "150px",
                            }}
                          >
                            <div className="w-full">
                              <SectionCard
                                boxLabel={box.label}
                                section={section}
                                items={stock.filter(
                                  (i) =>
                                    i.box === box.label &&
                                    i.section === section.label
                                )}
                                onAddItem={onAddItem}
                                onEditItem={onEditItem}
                                onDeleteItem={onDeleteItem}
                                onDeleteSection={onDeleteSection}
                                deleteItemConfirm={deleteItemConfirm}
                                onDeleteItemConfirm={onDeleteItemConfirm}
                                editMode={editMode}
                                onMoveUp={
                                  section.row > 0
                                    ? () =>
                                        moveSectionToRow(
                                          section.label,
                                          section.row - 1
                                        )
                                    : undefined
                                }
                                onMoveDown={() =>
                                  moveSectionToRow(
                                    section.label,
                                    section.row + 1
                                  )
                                }
                              />
                            </div>

                            {/* Resize handle between adjacent sections (editMode only) */}
                            {editMode && idx < rowSections.length - 1 && (
                              <div
                                className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize z-10 flex items-center justify-center hover:bg-primary/10 group"
                                style={{
                                  touchAction: "none",
                                  transform: "translateX(50%)",
                                }}
                                onPointerDown={(e) =>
                                  startSectionResize(
                                    e,
                                    section,
                                    rowSections[idx + 1]
                                  )
                                }
                              >
                                <div className="h-6 w-0.5 rounded-full bg-border group-hover:bg-primary/60" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </SortableContext>
                  </div>,
                  <RowSeparator
                    key={`sep-${rowIdx}`}
                    id={`row-sep-${rowIdx}`}
                    isOver={dragOverId === `row-sep-${rowIdx}`}
                    isDragging={isDraggingSection}
                    isNew={isLastRow}
                  />,
                ];
              })}
            </div>

            <DragOverlay>
              {draggingSection && (
                <div className="rounded-lg border bg-card shadow-lg px-3 py-2 text-sm font-semibold opacity-90 ring-2 ring-primary">
                  §{draggingSection}
                </div>
              )}
            </DragOverlay>
          </DndContext>

          {/* BOTTOM label */}
          <div className="px-1">
            <span className="text-xs font-semibold text-muted-foreground/40">▼ BOTTOM</span>
          </div>
        </div>
      )}
    </div>
  );
}
