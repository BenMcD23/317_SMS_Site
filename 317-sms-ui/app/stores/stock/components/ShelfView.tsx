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
import { useRef, useState } from "react";
import { BoxCard } from "./BoxCard";
import { ShelfBox, ShelfStructure, StockItem } from "@/lib/stores-types";

interface ShelfViewProps {
  structure: ShelfStructure;
  stock: StockItem[];
  onSelectBox: (label: string) => void;
  onStructureChange: (s: ShelfStructure) => void;
  onAddBox: () => void;
  editMode: boolean;
}

function DropGap({
  id,
  isOver,
  isDragging,
}: {
  id: string;
  isOver: boolean;
  isDragging: boolean;
}) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`shrink-0 rounded transition-all ${
        isOver
          ? "w-16 bg-primary/30 border-2 border-primary/60"
          : isDragging
          ? "w-10 bg-primary/5 border border-dashed border-primary/30"
          : "w-2"
      }`}
    />
  );
}

interface ShelfRowProps {
  level: 1 | 2 | 3;
  boxes: ShelfBox[];
  stock: StockItem[];
  onSelectBox: (label: string) => void;
  activeId: string | null;
  overId: string | null;
  editMode: boolean;
  onResizeBox: (label: string, newWidth: number) => void;
  isDragging: boolean;
}

function ShelfRow({
  level,
  boxes,
  stock,
  onSelectBox,
  activeId,
  overId,
  editMode,
  onResizeBox,
  isDragging,
}: ShelfRowProps) {
  const levelLabels: Record<number, string> = {
    3: "Top shelf",
    2: "Middle shelf",
    1: "Bottom shelf",
  };

  const rowRef = useRef<HTMLDivElement>(null);
  const [localWidths, setLocalWidths] = useState<Record<string, number>>({});

  const getWidth = (box: ShelfBox) => localWidths[box.label] ?? box.boxWidth;

  const isTargetLevel = overId?.startsWith(`gap-${level}-`) ?? false;

  function startResize(
    e: React.PointerEvent<HTMLDivElement>,
    boxALabel: string,
    boxBLabel: string
  ) {
    e.preventDefault();
    const el = e.currentTarget as HTMLDivElement;
    el.setPointerCapture(e.pointerId);

    const boxA = boxes.find((b) => b.label === boxALabel)!;
    const boxB = boxes.find((b) => b.label === boxBLabel)!;
    const startWidthA = getWidth(boxA);
    const startWidthB = getWidth(boxB);
    const startX = e.clientX;
    const rowWidth = rowRef.current?.clientWidth ?? 800;
    const totalFlexGrow = boxes.reduce((s, b) => s + getWidth(b), 0);
    const flexPerPx = totalFlexGrow / rowWidth;

    function onMove(ev: PointerEvent) {
      const deltaFlex = Math.round((ev.clientX - startX) * flexPerPx);
      setLocalWidths((prev) => ({
        ...prev,
        [boxALabel]: Math.max(10, startWidthA + deltaFlex),
        [boxBLabel]: Math.max(10, startWidthB - deltaFlex),
      }));
    }

    function onUp(ev: PointerEvent) {
      const deltaFlex = Math.round((ev.clientX - startX) * flexPerPx);
      const newA = Math.max(10, startWidthA + deltaFlex);
      const newB = Math.max(10, startWidthB - deltaFlex);
      el.removeEventListener("pointermove", onMove);
      onResizeBox(boxALabel, newA);
      onResizeBox(boxBLabel, newB);
    }

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp, { once: true });
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground px-1">
        {levelLabels[level]}
      </p>
      <div
        className={`relative rounded-lg transition-all duration-150 ${
          isDragging && isTargetLevel
            ? "ring-2 ring-primary ring-offset-2 bg-primary/5"
            : isDragging
            ? "ring-1 ring-border/60"
            : ""
        }`}
      >
        {/* Shelf plank */}
        <div className="absolute bottom-0 left-0 right-0 h-2 rounded bg-border" />

        {/* Boxes row */}
        <div ref={rowRef} className="flex items-end pb-2 min-h-[100px] w-full">
          {editMode && (
            <DropGap
              id={`gap-${level}-0`}
              isOver={overId === `gap-${level}-0`}
              isDragging={isDragging}
            />
          )}

          {boxes.map((box, idx) => (
            <div
              key={box.label}
              className="relative flex items-end"
              style={{
                flex: `${getWidth(box)} 1 80px`,
                minWidth: "80px",
                opacity: activeId === box.label ? 0.4 : 1,
              }}
            >
              <div className="w-full">
                <BoxCard
                  box={box}
                  stock={stock}
                  onClick={() => onSelectBox(box.label)}
                  editMode={editMode}
                />
              </div>

              {/* Resize handle between this box and the next (editMode only) */}
              {editMode && idx < boxes.length - 1 && (
                <div
                  className="absolute right-0 top-0 bottom-2 w-4 cursor-col-resize z-10 flex items-center justify-center hover:bg-primary/10 group"
                  style={{ touchAction: "none", transform: "translateX(50%)" }}
                  onPointerDown={(e) =>
                    startResize(e, box.label, boxes[idx + 1].label)
                  }
                >
                  <div className="h-6 w-0.5 rounded-full bg-border group-hover:bg-primary/60" />
                </div>
              )}

              {editMode && (
                <DropGap
                  id={`gap-${level}-${idx + 1}`}
                  isOver={overId === `gap-${level}-${idx + 1}`}
                  isDragging={isDragging}
                />
              )}
            </div>
          ))}

          {boxes.length === 0 && (
            <div className="flex items-center justify-center w-full pb-3">
              <p className="text-xs text-muted-foreground/50 italic">
                {editMode ? "Drop a box here" : "Empty shelf"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ShelfView({
  structure,
  stock,
  onSelectBox,
  onStructureChange,
  onAddBox,
  editMode,
}: ShelfViewProps) {
  const [activeBox, setActiveBox] = useState<ShelfBox | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const isDragging = activeBox !== null;

  const boxesByLevel = (level: 1 | 2 | 3) =>
    structure.boxes
      .filter((b) => b.shelfLevel === level)
      .sort((a, b) => a.shelfPosition - b.shelfPosition);

  function parseGapId(id: string): { level: number; insertAt: number } | null {
    const m = id.match(/^gap-(\d)-(\d+)$/);
    if (!m) return null;
    return { level: parseInt(m[1]), insertAt: parseInt(m[2]) };
  }

  function handleDragStart(event: DragStartEvent) {
    const box = (event.active.data.current as { box: ShelfBox })?.box;
    if (box) setActiveBox(box);
  }

  function handleDragOver(event: { over: { id: string } | null }) {
    setOverId(event.over?.id ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveBox(null);
    setOverId(null);

    const box: ShelfBox | undefined = (
      event.active.data.current as { box: ShelfBox }
    )?.box;
    if (!box || !event.over) return;

    const gap = parseGapId(String(event.over.id));
    if (!gap) return;

    const newLevel = gap.level as 1 | 2 | 3;
    const newPos = gap.insertAt;

    const remaining = structure.boxes
      .filter((b) => b.label !== box.label && b.shelfLevel === newLevel)
      .sort((a, b) => a.shelfPosition - b.shelfPosition);

    const clampedPos = Math.max(0, Math.min(newPos, remaining.length));

    const updatedBoxes = structure.boxes.map((b) => {
      if (b.label === box.label) {
        return { ...b, shelfLevel: newLevel, shelfPosition: clampedPos };
      }
      if (b.shelfLevel === box.shelfLevel && b.label !== box.label) {
        const sorted = structure.boxes
          .filter(
            (x) => x.shelfLevel === box.shelfLevel && x.label !== box.label
          )
          .sort((a, b) => a.shelfPosition - b.shelfPosition);
        const idx = sorted.findIndex((x) => x.label === b.label);
        return { ...b, shelfPosition: idx };
      }
      if (b.shelfLevel === newLevel && b.label !== box.label) {
        const idx = remaining.findIndex((x) => x.label === b.label);
        return { ...b, shelfPosition: idx < clampedPos ? idx : idx + 1 };
      }
      return b;
    });

    onStructureChange({ boxes: updatedBoxes });

    try {
      const res = await fetch(`/api/stores/boxes/${box.label}/layout`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shelfLevel: newLevel, shelfPosition: clampedPos }),
      });
      if (res.ok) onStructureChange(await res.json());
    } catch {
      // error — server response will reset
    }
  }

  async function handleResizeBox(label: string, newWidth: number) {
    try {
      const res = await fetch(`/api/stores/boxes/${label}/layout`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boxWidth: newWidth }),
      });
      if (res.ok) onStructureChange(await res.json());
    } catch {}
  }

  const shelfContent = (
    <div className="space-y-6">
      {([3, 2, 1] as const).map((level) => (
        <ShelfRow
          key={level}
          level={level}
          boxes={boxesByLevel(level)}
          stock={stock}
          onSelectBox={onSelectBox}
          activeId={activeBox?.label ?? null}
          overId={overId}
          editMode={editMode}
          onResizeBox={handleResizeBox}
          isDragging={isDragging}
        />
      ))}
    </div>
  );

  if (!editMode) return shelfContent;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver as never}
      onDragEnd={handleDragEnd}
    >
      {shelfContent}
      <DragOverlay>
        {activeBox && (
          <BoxCard
            box={activeBox}
            stock={stock}
            onClick={() => {}}
            overlay
            editMode={true}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
