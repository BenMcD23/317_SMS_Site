"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@317/ui-common/components/ui/button";
import { Label } from "@317/ui-common/components/ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@317/ui-common/components/responsive-dialog";
import { BadgeOrder } from "@/lib/stores-types";
import { type BadgeCategory, buildBadgeName, useReference } from "@/lib/reference";
import { CadetSearchInput } from "@/components/cadet-search";
import {
  BadgePicker,
  GainedWhereFields,
  type GainedWhereState,
  type NewBadgeEntry,
  emptyGainedWhere,
  gainedWhereSummary,
  isGainedWhereComplete,
} from "./badge-fields";

/**
 * "New Badge Order": pick a cadet, add badges (each with where it was
 * gained), create the order. Holds its own form state, cleared each time it
 * opens. Split out of the badge orders page, which had grown past 1,500 lines.
 */
export function NewBadgeOrderDialog({
  open,
  onOpenChange,
  token,
  onCreated,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | null;
  onCreated: (order: BadgeOrder) => void;
  onError: (message: string) => void;
}) {
  const { gainedWhereOptions } = useReference();
  const [newCadetCin, setNewCadetCin] = useState<number | null>(null);
  const [newCadetName, setNewCadetName] = useState("");
  const [newBadges, setNewBadges] = useState<NewBadgeEntry[]>([]);
  const [newCategory, setNewCategory] = useState<BadgeCategory | null>(null);
  const [newSubType, setNewSubType] = useState<string | null>(null);
  const [newLevel, setNewLevel] = useState<string | null>(null);
  const [newGainedWhere, setNewGainedWhere] = useState<GainedWhereState>(emptyGainedWhere());
  const [submitting, setSubmitting] = useState(false);
  const currentBadgeName = newCategory ? buildBadgeName(newCategory, newSubType, newLevel) : null;

  // A fresh form every time it opens: reset while rendering the open, React's
  // pattern for state that follows a prop, so no stale badges flash first.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setNewCadetCin(null);
      setNewCadetName("");
      setNewBadges([]);
      setNewCategory(null);
      setNewSubType(null);
      setNewLevel(null);
      setNewGainedWhere(emptyGainedWhere());
    }
  }

  function handleAddBadgeToNew() {
    if (!currentBadgeName || !isGainedWhereComplete(newGainedWhere)) return;
    setNewBadges((prev) => [...prev, { badgeName: currentBadgeName, ...newGainedWhere }]);
    setNewCategory(null);
    setNewSubType(null);
    setNewLevel(null);
    setNewGainedWhere(emptyGainedWhere());
  }

  async function handleCreateOrder() {
    if (!newCadetCin || newBadges.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/stores/badges/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cadetCin: newCadetCin,
          items: newBadges.map((b) => ({
            badgeName: b.badgeName,
            gainedWhere: b.gainedWhere,
            gainedWhereDetail: b.gainedWhereDetail,
            gainedDateFrom: b.gainedDateFrom,
            gainedDateTo: b.gainedDateTo,
          })),
        }),
      });
      if (!res.ok) throw new Error("Failed to create order");
      const created = await res.json();
      onCreated(created);
      onOpenChange(false);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>New Badge Order</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Cadet</Label>
            <CadetSearchInput
              token={token}
              selectedCin={newCadetCin}
              selectedName={newCadetName}
              onSelect={(cin, name) => {
                setNewCadetCin(cin || null);
                setNewCadetName(name);
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Badges</Label>

            {newBadges.length > 0 && (
              <ul className="space-y-1">
                {newBadges.map((b, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block">{b.badgeName}</span>
                      <span className="text-muted-foreground block text-xs">
                        {gainedWhereSummary(gainedWhereOptions, b)}
                      </span>
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-muted-foreground h-6 w-6"
                      onClick={() => setNewBadges((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-2 rounded-md border border-dashed p-3">
              <BadgePicker
                category={newCategory}
                subType={newSubType}
                level={newLevel}
                onCategory={(c) => {
                  setNewCategory(c);
                  setNewSubType(null);
                  setNewLevel(null);
                }}
                onSubType={(s) => {
                  setNewSubType(s);
                  setNewLevel(null);
                }}
                onLevel={setNewLevel}
              />
              {currentBadgeName && (
                <p className="bg-muted rounded-md px-3 py-1.5 text-xs font-medium">{currentBadgeName}</p>
              )}
              {currentBadgeName && <GainedWhereFields value={newGainedWhere} onChange={setNewGainedWhere} />}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={!currentBadgeName || !isGainedWhereComplete(newGainedWhere)}
                onClick={handleAddBadgeToNew}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Badge
              </Button>
            </div>
          </div>
        </div>

        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreateOrder} disabled={submitting || !newCadetCin || newBadges.length === 0}>
            {submitting ? "Creating..." : "Create Order"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
