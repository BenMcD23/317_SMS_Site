"use client";

/**
 * The badge picker and "where was it gained" fields, shared by the New Order
 * dialog and "Add badge" on an existing order. Split out of the badge orders
 * page, which had grown past 1,500 lines.
 */
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type BadgeCategory, type GainedWhereOption, gainedWhereLabel, useReference } from "@/lib/reference";

export function BadgePicker({
  category,
  subType,
  level,
  onCategory,
  onSubType,
  onLevel,
}: {
  category: BadgeCategory | null;
  subType: string | null;
  level: string | null;
  onCategory: (c: BadgeCategory | null) => void;
  onSubType: (s: string | null) => void;
  onLevel: (l: string | null) => void;
}) {
  const { badgeCategories } = useReference();
  return (
    <div className="space-y-2">
      {/* Searchable: the badge catalogue is too long to scroll on a phone. */}
      <SearchableSelect
        aria-label="Badge type"
        value={category?.id ?? ""}
        onValueChange={(v) => onCategory(badgeCategories.find((c) => c.id === v) ?? null)}
        placeholder="Badge type…"
        searchPlaceholder="Find a badge type…"
        className="h-8 text-sm"
        options={badgeCategories.map((c) => ({ value: c.id, label: c.name }))}
      />

      {category && (category.subTypes || category.items) && (
        <SearchableSelect
          aria-label={category.subTypes ? "Sub-type" : "Badge"}
          value={subType ?? ""}
          onValueChange={(v) => onSubType(v)}
          placeholder={category.subTypes ? "Sub-type…" : "Badge…"}
          className="h-8 text-sm"
          options={(category.subTypes ?? category.items ?? []).map((v) => ({ value: v, label: v }))}
        />
      )}

      {category?.levels && (!category.subTypes || subType) && (
        // A handful of levels: one tap each, and the choice stays in view.
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Level"
          className="flex-wrap"
          value={level ?? ""}
          onValueChange={(v) => v && onLevel(v)}
        >
          {category.levels.map((l) => (
            <ToggleGroupItem key={l} value={l} className="px-3">
              {l}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </div>
  );
}

export type GainedWhereState = {
  gainedWhere: string | null;
  gainedWhereDetail: string;
  gainedDateFrom: string;
  gainedDateTo: string;
};

export function emptyGainedWhere(): GainedWhereState {
  return { gainedWhere: null, gainedWhereDetail: "", gainedDateFrom: "", gainedDateTo: "" };
}

export function isGainedWhereComplete(g: GainedWhereState): boolean {
  if (!g.gainedWhere) return false;
  if (g.gainedWhere === "other" && !g.gainedWhereDetail.trim()) return false;
  if (!g.gainedDateFrom || !g.gainedDateTo) return false;
  return true;
}

export function GainedWhereFields({
  value,
  onChange,
}: {
  value: GainedWhereState;
  onChange: (v: GainedWhereState) => void;
}) {
  const { gainedWhereOptions } = useReference();
  // Every option records the dates attended.
  const needsDates = !!value.gainedWhere;
  return (
    <div className="space-y-2">
      <Select
        value={value.gainedWhere ?? ""}
        onValueChange={(v) =>
          onChange({ ...value, gainedWhere: v, gainedWhereDetail: "", gainedDateFrom: "", gainedDateTo: "" })
        }
      >
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="Gained where…" />
        </SelectTrigger>
        <SelectContent>
          {gainedWhereOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value.gainedWhere === "other" && (
        <Input
          className="h-8 text-sm"
          placeholder="What was it?"
          value={value.gainedWhereDetail}
          onChange={(e) => onChange({ ...value, gainedWhereDetail: e.target.value })}
        />
      )}

      {needsDates && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="date"
            className="h-8 text-sm"
            value={value.gainedDateFrom}
            max={value.gainedDateTo || undefined}
            onChange={(e) => onChange({ ...value, gainedDateFrom: e.target.value })}
          />
          <Input
            type="date"
            className="h-8 text-sm"
            value={value.gainedDateTo}
            min={value.gainedDateFrom || undefined}
            onChange={(e) => onChange({ ...value, gainedDateTo: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

export function gainedWhereSummary(
  options: GainedWhereOption[],
  g: {
    gainedWhere?: string | null;
    gainedWhereDetail?: string | null;
    gainedDateFrom?: string | null;
    gainedDateTo?: string | null;
  }
): string | null {
  const label = g.gainedWhere === "other" ? g.gainedWhereDetail : gainedWhereLabel(options, g.gainedWhere);
  if (!label) return null;
  if (g.gainedDateFrom && g.gainedDateTo) {
    return `${label} (${g.gainedDateFrom.slice(0, 10)} – ${g.gainedDateTo.slice(0, 10)})`;
  }
  return label;
}

export type NewBadgeEntry = {
  badgeName: string;
  gainedWhere: string | null;
  gainedWhereDetail: string;
  gainedDateFrom: string;
  gainedDateTo: string;
};
