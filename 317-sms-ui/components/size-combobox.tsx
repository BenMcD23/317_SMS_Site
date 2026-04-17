"use client";

import { useState, useRef, useEffect } from "react";
import { ITEM_SIZES } from "@/lib/stores-items";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SizeComboboxProps {
  itemType: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export function SizeCombobox({
  itemType,
  value,
  onChange,
  placeholder = "Size",
  className,
  disabled,
  id,
  onKeyDown,
}: SizeComboboxProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = ITEM_SIZES[itemType] ?? [];
  const filtered = value.trim()
    ? suggestions.filter((s) => s.toLowerCase().includes(value.trim().toLowerCase()))
    : suggestions;

  function handleSelect(size: string) {
    onChange(size);
    setOpen(false);
  }

  function handleBlur(e: React.FocusEvent) {
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    setOpen(false);
  }

  // Close if itemType changes
  useEffect(() => { setOpen(false); }, [itemType]);

  return (
    <div ref={containerRef} className={cn("relative", className)} onBlur={handleBlur}>
      <Input
        id={id}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          onKeyDown?.(e);
        }}
      />
      {open && filtered.length > 0 && !disabled && (
        <div className="absolute z-50 mt-1 max-h-52 w-full min-w-[120px] overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md">
          {filtered.map((size) => (
            <button
              key={size}
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(size)}
            >
              {size}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
