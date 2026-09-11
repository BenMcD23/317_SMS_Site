"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Search, ChevronsUpDown, Check, X, Loader2 } from "lucide-react";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

export type CadetResult = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
};

interface CadetSearchInputProps {
  token: string | null;
  selectedCin: number | null;
  selectedName: string;
  onSelect: (cin: number, name: string) => void;
}

export function CadetSearchInput({ token, selectedCin, selectedName, onSelect }: CadetSearchInputProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CadetResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Debounced server search; Command's own filtering is off so the API decides.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch(`${API_BASE}/cadets/search?q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setResults(await res.json());
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, token]);

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("w-full justify-between", !selectedCin && "text-muted-foreground")}
          >
            <span className="flex min-w-0 items-center gap-2">
              {selectedCin ? (
                <Check className="h-4 w-4 shrink-0 text-green-600" />
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
