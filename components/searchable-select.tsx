"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SearchableOption = {
  value: string;
  label: string;
  /** Shown faint beside the label: a flight, a rank, "3 in stock". */
  hint?: string;
  /** Options with the same group are listed under that heading. */
  group?: string;
  /** Extra words the search should match. */
  keywords?: string[];
  disabled?: boolean;
};

/**
 * A dropdown you can type into, for lists too long to scroll: lessons, badges,
 * item types, NCOs, events. Same job as the shadcn `Select` (pick one value)
 * but with a search box, so "rad" finds Radio – Bronze. A popover rather than
 * a sheet so it opens where the field is, on a phone too.
 *
 * The trigger is a combobox button labelled by its `id`'s `<Label htmlFor>`,
 * so forms and tests find it the same way as a Select.
 */
export function SearchableSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder = "Choose…",
  searchPlaceholder = "Search…",
  emptyText = "Nothing matches.",
  disabled,
  className,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: {
  id?: string;
  value: string | null | undefined;
  onValueChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  // Keep the given order, grouped by first appearance.
  const groups: Array<[string, SearchableOption[]]> = [];
  for (const o of options) {
    const name = o.group ?? "";
    const g = groups.find(([n]) => n === name);
    if (g) g[1].push(o);
    else groups.push([name, [o]]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-between px-3 font-normal",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">
            {selected ? selected.label : placeholder}
            {selected?.hint && <span className="text-muted-foreground ml-2 text-xs">{selected.hint}</span>}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-56 p-0" align="start">
        {/* Every word typed must appear, rather than cmdk's fuzzy match, which
            let "zzz" keep "Bronze": people type part of a name and expect the
            list to narrow to just those. */}
        <Command
          filter={(value, search) => {
            const text = value.toLowerCase();
            return search
              .toLowerCase()
              .split(/\s+/)
              .filter(Boolean)
              .every((w) => text.includes(w))
              ? 1
              : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groups.map(([name, list]) => (
              <CommandGroup key={name || "_"} heading={name || undefined}>
                {list.map((o) => (
                  <CommandItem
                    key={o.value}
                    // cmdk matches on `value`; give it the words people type.
                    value={[o.label, o.hint, o.group, ...(o.keywords ?? []), o.value]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={o.disabled}
                    onSelect={() => {
                      onValueChange(o.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("size-4", o.value === value ? "opacity-100" : "opacity-0")}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.hint && <span className="text-muted-foreground text-xs">{o.hint}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
