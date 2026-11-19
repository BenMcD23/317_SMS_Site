"use client";

import { useState } from "react";
import { Button } from "@317/ui-common/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@317/ui-common/lib/utils";
import { Search, ChevronsUpDown, Check, X, Loader2 } from "lucide-react";

import { type CadetHit, useCadetSearch } from "@/lib/use-cadet-search";

/** Kept for the pages that name it; the same shape as `CadetHit`. */
export type CadetResult = CadetHit;

interface CadetSearchInputProps {
  token: string | null;
  selectedCin: number | null;
  selectedName: string;
  onSelect: (cin: number, name: string) => void;
}

export function CadetSearchInput({ token, selectedCin, selectedName, onSelect }: CadetSearchInputProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { hits: results, searching } = useCadetSearch(query, { enabled: !!token });

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            // A combobox isn't named by its text, so say what it is and what's chosen.
            aria-label={selectedCin ? `Cadet: ${selectedName}` : "Search cadet"}
            className={cn("w-full justify-between", !selectedCin && "text-muted-foreground")}
          >
            <span className="flex min-w-0 items-center gap-2">
              {selectedCin ? (
                <Check className="text-success h-4 w-4 shrink-0" />
              ) : (
                <Search className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{selectedCin ? selectedName : "Search cadet…"}</span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Type a name…" value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>
                {searching ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                  </span>
                ) : query.trim().length < 2 ? (
                  "Type at least 2 characters."
                ) : (
                  "No cadet found."
                )}
              </CommandEmpty>
              <CommandGroup>
                {results.map((c) => (
                  <CommandItem
                    key={c.cin}
                    value={String(c.cin)}
                    onSelect={() => {
                      onSelect(c.cin, `${c.first_name} ${c.last_name}`);
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("h-4 w-4", c.cin === selectedCin ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1 truncate">
                      {c.rank ? `${c.rank} ` : ""}
                      {c.first_name} {c.last_name}
                    </span>
                    {c.flight && <span className="text-muted-foreground text-xs">Flt {c.flight}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedCin && (
        <button
          type="button"
          onClick={() => onSelect(0, "")}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Clear selected cadet"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
