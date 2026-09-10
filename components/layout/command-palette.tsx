"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { Search, User } from "lucide-react";

import { apiFetch } from "@/lib/api-fetch";
import { API_BASE } from "@/lib/config";
import { flattenLinks, visibleSections } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

type CadetHit = { cin: number; first_name: string; last_name: string; rank: string | null; flight: string | null };

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * ⌘K / Ctrl+K jump box: every page the user can reach, plus a cadet search
 * that goes straight to the record. Pages are filtered client-side by cmdk;
 * cadets come from the API once the query is two characters long.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query.trim(), 200);
  const token = session?.id_token;

  const pages = flattenLinks(visibleSections(session?.role, session?.user?.email ?? undefined));

  const { data: cadets = [], isFetching } = useQuery<CadetHit[]>({
    queryKey: ["cadets", "search", debouncedQuery],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/cadets/search?q=${encodeURIComponent(debouncedQuery)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.ok ? res.json() : [];
    },
    enabled: open && !!token && debouncedQuery.length >= 2 && session?.role === "staff",
    staleTime: 30_000,
  });

  const go = (href: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Jump to" description="Search pages and cadets">
      <CommandInput placeholder="Search pages or cadets…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>{isFetching ? "Searching…" : "Nothing found."}</CommandEmpty>
        {cadets.length > 0 && (
          <>
            <CommandGroup heading="Cadets">
              {cadets.map((c) => (
                <CommandItem key={c.cin} value={`cadet ${c.first_name} ${c.last_name} ${c.cin}`} onSelect={() => go(`/cadets/${c.cin}`)}>
                  <User />
                  <span>{c.first_name} {c.last_name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{[c.rank, c.flight && `${c.flight} Flt`].filter(Boolean).join(" · ")}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        <CommandGroup heading="Pages">
          {pages.map((p) => (
            <CommandItem
              key={p.href}
              value={[...p.path, p.label, ...(p.keywords ?? [])].join(" ")}
              onSelect={() => go(p.href)}
            >
              <p.icon />
              <span>{p.label}</span>
              {p.path.length > 0 && <span className="ml-auto text-xs text-muted-foreground">{p.path.join(" › ")}</span>}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/** Header button that opens the palette; also registers the keyboard shortcut. */
export function CommandPaletteTrigger() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-2 text-muted-foreground sm:w-56 sm:justify-start"
        onClick={() => setOpen(true)}
        aria-label="Search pages and cadets"
      >
        <Search className="size-3.5" />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="pointer-events-none ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:inline-block">
          ⌘K
        </kbd>
      </Button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
