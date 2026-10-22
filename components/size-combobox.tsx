"use client";

import { useState, useRef } from "react";
import { useReference } from "@/lib/reference";
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
  /**
   * Only allow sizes from the catalogue. Orders use this so every requested
   * size matches a real stock size; adding stock leaves it off so a size not
   * yet in the catalogue can still be recorded.
   */
  strict?: boolean;
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
  strict = false,
}: SizeComboboxProps) {
  const [open, setOpen] = useState(false);
  // In strict mode typed text is only a search filter; `value` changes only
  // when a listed size is picked.
  const [query, setQuery] = useState("");
  // Close the list when the item type changes ("adjust state during render").
  const [prevItemType, setPrevItemType] = useState(itemType);
  if (itemType !== prevItemType) {
    setPrevItemType(itemType);
    setOpen(false);
  }
  const containerRef = useRef<HTMLDivElement>(null);

  const { sizes } = useReference();
  const suggestions = sizes[itemType] ?? [];
  // An item type with no catalogued sizes would leave nothing to pick, so fall
  // back to free text rather than block the order.
  const restricted = strict && suggestions.length > 0;
  const search = restricted ? query : value;
  const filtered = search.trim()
    ? suggestions.filter((s) => s.toLowerCase().includes(search.trim().toLowerCase()))
    : suggestions;

  function handleSelect(size: string) {
    onChange(size);
    setQuery("");
    setOpen(false);
  }

  function handleBlur(e: React.FocusEvent) {
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)} onBlur={handleBlur}>
      <Input
        id={id}
        value={restricted && open ? query : value}
        onChange={(e) => {
          if (restricted) setQuery(e.target.value);
          else onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={restricted && open && value ? value : placeholder}
        disabled={disabled}
        autoComplete="off"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQuery("");
            setOpen(false);
          }
          // Enter picks the top match while searching, rather than submitting.
          if (restricted && open && e.key === "Enter" && query.trim() && filtered.length > 0) {
            e.preventDefault();
            handleSelect(filtered[0]);
            return;
          }
          onKeyDown?.(e);
        }}
      />
      {open && !disabled && filtered.length > 0 && (
        <div className="bg-popover text-popover-foreground absolute z-50 mt-1 max-h-52 w-full min-w-[120px] overflow-auto rounded-md border shadow-md">
          {filtered.map((size) => (
            <button
              key={size}
              type="button"
              className={cn(
                "hover:bg-accent hover:text-accent-foreground w-full px-3 py-1.5 text-left text-sm",
                size === value && "font-medium"
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(size)}
            >
              {size}
            </button>
          ))}
        </div>
      )}
      {open && !disabled && restricted && filtered.length === 0 && (
        <div className="bg-popover text-muted-foreground absolute z-50 mt-1 w-full min-w-[120px] rounded-md border px-3 py-1.5 text-sm shadow-md">
          No matching sizes
        </div>
      )}
    </div>
  );
}
