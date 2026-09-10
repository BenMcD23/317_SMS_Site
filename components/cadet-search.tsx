"use client";

import { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

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
          const res = await apiFetch(`${API_BASE}/cadets/search?q=${encodeURIComponent(q)}`, {
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
      <div className="bg-muted/40 flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
        <span className="flex-1 font-medium">{selectedName}</span>
        <button
          type="button"
          onClick={() => onSelect(0, "")}
          className="text-muted-foreground hover:text-destructive text-xs"
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
          <Loader2 className="text-muted-foreground absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin" />
        )}
      </div>

      {open && (
        <div className="bg-popover absolute z-50 mt-1 w-full rounded-md border shadow-md">
          {results.map((c) => (
            <button
              key={c.cin}
              type="button"
              className="hover:bg-accent flex w-full items-center gap-3 px-3 py-2 text-left text-sm"
              onClick={() => {
                const name = `${c.rank ? c.rank + " " : ""}${c.first_name} ${c.last_name}`;
                onSelect(c.cin, `${c.first_name} ${c.last_name}`);
                setQuery(name);
                setOpen(false);
              }}
            >
              <span className="font-medium">
                {c.first_name} {c.last_name}
              </span>
              <span className="text-muted-foreground ml-auto flex items-center gap-2 text-xs">
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
