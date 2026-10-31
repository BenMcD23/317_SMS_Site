"use client";

import { Check } from "lucide-react";

import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ErrorAlert } from "@/components/error-alert";
import { cn } from "@/lib/utils";
import { useApiQuery } from "@/lib/use-api-query";

export type AssessorMode = "staff" | "other";

// What /staff answers with. Only the roster fields the picker needs.
type StaffRow = { cin: number; firstName: string; lastName: string; rank: string | null };
const NO_STAFF: StaffRow[] = [];

/**
 * Who will write a cadet's final DofE report: a staff member picked from the
 * roster, or anyone else typed in (the assessor is often a civilian outside
 * SMS). A staff pick keeps their CIN, which is what lets that person filter
 * the grid to the reports they owe; a typed name can't be filtered on.
 */
export function AssessorField({
  mode,
  onModeChange,
  name,
  cin,
  onChange,
}: {
  mode: AssessorMode;
  onModeChange: (mode: AssessorMode) => void;
  name: string;
  cin: number | null;
  onChange: (name: string, cin: number | null) => void;
}) {
  const roster = useApiQuery<StaffRow[]>(["staff", "roster"], "/staff", { enabled: mode === "staff" });
  const staff = Array.isArray(roster.data) ? roster.data : NO_STAFF;
  const sorted = [...staff].sort(
    (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
  );

  return (
    <Field>
      <FieldLabel id="assessor-mode">Assessor</FieldLabel>
      <ToggleGroup
        type="single"
        variant="outline"
        aria-labelledby="assessor-mode"
        value={mode}
        // Radix sends "" when the pressed one is tapped again; keep it.
        onValueChange={(v) => {
          if (!v || v === mode) return;
          // A name picked in one mode means nothing in the other.
          onChange("", null);
          onModeChange(v as AssessorMode);
        }}
        className="w-full"
      >
        <ToggleGroupItem value="staff" className="h-9 flex-1">
          Staff member
        </ToggleGroupItem>
        <ToggleGroupItem value="other" className="h-9 flex-1">
          Someone else
        </ToggleGroupItem>
      </ToggleGroup>

      {mode === "other" ? (
        <Input
          aria-label="Assessor name"
          placeholder="Full name"
          autoComplete="off"
          value={name}
          onChange={(e) => onChange(e.target.value, null)}
        />
      ) : roster.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : roster.error ? (
        <ErrorAlert message={roster.error.message} title="Could not load the staff list" />
      ) : (
        <Command
          className="h-auto rounded-md border"
          // Rank and CIN are searchable too, but the name is what's kept.
          filter={(value, search, keywords) =>
            [value, ...(keywords ?? [])].join(" ").toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Search staff…" aria-label="Search staff" />
          <CommandList className="max-h-44">
            <CommandEmpty>
              {sorted.length === 0
                ? "Nobody on the staff list yet. It fills when the staff scraper runs."
                : "No staff member found."}
            </CommandEmpty>
            {sorted.map((s) => {
              const full = `${s.firstName} ${s.lastName}`;
              return (
                <CommandItem
                  key={s.cin}
                  value={`${full} ${s.cin}`}
                  keywords={s.rank ? [s.rank] : undefined}
                  onSelect={() => onChange(full, s.cin)}
                  className="min-h-9"
                >
                  <Check className={cn("size-4", cin === s.cin ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 truncate">{full}</span>
                  {s.rank && <span className="text-muted-foreground text-xs">{s.rank}</span>}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      )}
    </Field>
  );
}
