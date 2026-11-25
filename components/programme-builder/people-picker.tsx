"use client";

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";

import { Button } from "@317/ui-common/components/ui/button";
import { cn } from "@317/ui-common/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Person } from "@/lib/programme-builder";

const GROUPS: { kind: Person["kind"]; label: string }[] = [
  { kind: "staff", label: "Staff" },
  { kind: "nco", label: "NCOs" },
  { kind: "cadet", label: "Cadets" },
];

/** Whether someone's booked holiday covers a night. */
export function awayOn(person: Pick<Person, "away">, date: string): boolean {
  return person.away.some(([from, to]) => from <= date && date <= to);
}

/**
 * Who's on a session: staff and NCOs running it, or cadets pulled out of
 * their flight for it. Each name says if they're on holiday that night or
 * already on something else in the same half, so a clash is seen before it's
 * made rather than in the checks afterwards.
 */
export function PeoplePicker({
  id,
  people,
  value,
  onChange,
  date,
  busy,
}: {
  id: string;
  people: Person[];
  value: string[];
  onChange: (keys: string[]) => void;
  /** The night, "YYYY-MM-DD", to say who's away. */
  date: string | null;
  /** Person key → what else they're on in the same half. */
  busy: Map<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const byKey = new Map(people.map((p) => [p.key, p]));
  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="On this session">
          {value.map((key) => {
            const p = byKey.get(key);
            const warn = p && date && awayOn(p, date) ? "On holiday" : busy.get(key);
            return (
              <li
                key={key}
                className={cn(
                  "bg-muted flex items-center gap-1 rounded-md py-0.5 pr-0.5 pl-2 text-sm",
                  warn && "bg-destructive/10 text-destructive"
                )}
              >
                <span>{p?.name ?? "Someone no longer on the roster"}</span>
                {warn && <span className="text-xs">({warn})</span>}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Take ${p?.name ?? "them"} off`}
                  onClick={() => toggle(key)}
                >
                  <X />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" size="sm" className="self-start">
            <Plus /> Add people
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search by name" />
            <CommandList className="max-h-72">
              <CommandEmpty>No one by that name.</CommandEmpty>
              {GROUPS.map(({ kind, label }) => {
                const group = people.filter((p) => p.kind === kind);
                if (!group.length) return null;
                return (
                  <CommandGroup key={kind} heading={label}>
                    {group.map((p) => {
                      const chosen = value.includes(p.key);
                      const note =
                        date && awayOn(p, date)
                          ? "On holiday"
                          : (busy.get(p.key) ?? (p.flight ? `${p.flight} Flight` : ""));
                      return (
                        <CommandItem key={p.key} value={`${p.name} ${p.key}`} onSelect={() => toggle(p.key)}>
                          <Check className={cn("size-4", chosen ? "opacity-100" : "opacity-0")} />
                          <span className="min-w-0 flex-1 truncate">{p.name}</span>
                          {note && (
                            <span
                              className={cn(
                                "text-xs",
                                note === "On holiday" || busy.has(p.key)
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                              )}
                            >
                              {note}
                            </span>
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                );
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
