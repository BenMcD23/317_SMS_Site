"use client";

import { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { API_BASE } from "@/lib/config";

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

export function CadetSearchInput({
  token,
  selectedCin,
  selectedName,
  onSelect,
}: CadetSearchInputProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CadetResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (q.length < 2) {
        setResults([]);
        setOpen(false);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setSearching(true);
        try {
          const res = await fetch(`${API_BASE}/cadets/search?q=${encodeURIComponent(q)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data: CadetResult[] = await res.json();
          setResults(data);
          setOpen(data.length > 0);
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      }, 250);
    },
    [token]
  );

  // Show selected cadet with "Change" button
  if (selectedCin) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <span className="flex-1 font-medium">{selectedName}</span>
        <button
          type="button"
          onClick={() => onSelect(0, "")}
          className="text-xs text-muted-foreground hover:text-destructive"
        >
          ✕ Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Input
          placeholder="Search cadet name..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            search(e.target.value);
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          autoComplete="off"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {results.map((c) => (
            <button
              key={c.cin}
              type="button"
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                const name = `${c.rank ? c.rank + " " : ""}${c.first_name} ${c.last_name}`;
                onSelect(c.cin, `${c.first_name} ${c.last_name}`);
                setQuery(name);
                setOpen(false);
              }}
            >
              <span className="font-medium">{c.first_name} {c.last_name}</span>
              <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                {c.rank && <span>{c.rank}</span>}
                {c.flight && <span>Flt {c.flight}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}