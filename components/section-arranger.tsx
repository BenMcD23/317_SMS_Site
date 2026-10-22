"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Item {
  id: string;
  title: string;
}

function Row({
  item,
  index,
  count,
  onStep,
}: {
  item: Item;
  index: number;
  count: number;
  onStep: (id: string, by: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "bg-card flex min-h-14 items-center gap-2 px-2 py-2",
        isDragging && "ring-ring/50 relative z-10 ring-2"
      )}
    >
      {/* The grip is the only drag handle, so scrolling past the list on a
          phone never picks a section up by accident. */}
      <Button
        ref={setActivatorNodeRef}
        variant="ghost"
        size="icon"
        className="size-9 cursor-grab touch-none active:cursor-grabbing"
        aria-label={`Drag ${item.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical />
      </Button>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        aria-label={`Move ${item.title} up`}
        disabled={index === 0}
        onClick={() => onStep(item.id, -1)}
      >
        <ArrowUp />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        aria-label={`Move ${item.title} down`}
        disabled={index === count - 1}
        onClick={() => onStep(item.id, 1)}
      >
        <ArrowDown />
      </Button>
    </li>
  );
}

/**
 * A page's sections as a short list of titles to drag into a new order, for
 * dashboards the user can rearrange. Sections collapse to their titles while
 * arranging because dragging a chart-sized block on a phone is unworkable;
 * the up/down buttons do the same job for a keyboard or an unsteady thumb.
 * Calls `onChange` with the whole new order; saving it is the caller's job.
 */
export function SectionArranger({
  items,
  onChange,
  label = "Section order",
}: {
  items: Item[];
  onChange: (ids: string[]) => void;
  label?: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const ids = items.map((i) => i.id);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onChange(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };
  const onStep = (id: string, by: -1 | 1) => {
    const from = ids.indexOf(id);
    const to = from + by;
    if (to >= 0 && to < ids.length) onChange(arrayMove(ids, from, to));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol aria-label={label} className="divide-y overflow-hidden rounded-lg border">
          {items.map((item, i) => (
            <Row key={item.id} item={item} index={i} count={items.length} onStep={onStep} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
