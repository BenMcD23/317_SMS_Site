"use client";

import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ArrowLeft, ArrowRight, ChevronLeft, Plus, Trash2 } from "lucide-react";
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
}: BoxDetailViewProps) {
  const [addSectionValue, setAddSectionValue] = useState<string | null>(null);
  const [togglingTopEnd, setTogglingTopEnd] = useState(false);
  const [widthOverrides, setWidthOverrides] = useState<Record<string, number>>(
    {}
  );

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

  // Move a section up or down to a different row
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

  // Within-row drag reorder
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

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

      // Keep overrides visible until API responds
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

  async function handleTopEndToggle() {
    const newEnd = box.topEnd === "left" ? "right" : "left";
    setTogglingTopEnd(true);
    try {
      const res = await fetch(`/api/stores/boxes/${box.label}/layout`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topEnd: newEnd }),
      });
      if (res.ok) onStructureChange(await res.json());
    } finally {
      setTogglingTopEnd(false);
    }
  }

  const topEndLabel = box.topEnd === "left" ? "← Top end" : "Top end →";
  const TopEndIcon = box.topEnd === "left" ? ArrowLeft : ArrowRight;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ChevronLeft className="h-4 w-4" />
          Shelf
        </Button>

        <h2 className="text-xl font-bold">Box {box.label}</h2>

        <div className="ml-auto flex items-center gap-2">
          {/* Top-end toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleTopEndToggle}
            disabled={togglingTopEnd}
            className="gap-1.5 text-xs"
            title="Toggle which physical end of the box is the top"
          >
            <TopEndIcon className="h-3.5 w-3.5" />
            {topEndLabel}
          </Button>

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
              Delete Box
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
          {/* TOP / BOTTOM orientation labels */}
          <div className="flex justify-between px-1">
            <span
              className={`text-xs font-semibold ${
                box.topEnd === "left"
                  ? "text-primary"
                  : "text-muted-foreground/40"
              }`}
            >
              {box.topEnd === "left" ? "▲ TOP" : "BOTTOM"}
            </span>
            <span
              className={`text-xs font-semibold ${
                box.topEnd === "right"
                  ? "text-primary"
                  : "text-muted-foreground/40"
              }`}
            >
              {box.topEnd === "right" ? "▲ TOP" : "BOTTOM"}
            </span>
          </div>

          {/* Rows */}
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div className="space-y-2">
              {rowIndexes.map((rowIdx) => {
                const rowSections = sectionsByRow(rowIdx);
                const sectionIds = rowSections.map((s) => s.label);

                return (
                  <div
                    key={rowIdx}
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
                  </div>
                );
              })}
            </div>
          </DndContext>
        </div>
      )}
    </div>
  );
}
