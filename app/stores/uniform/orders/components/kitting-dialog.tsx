"use client";

import { useState } from "react";
import { Button } from "@317/ui-common/components/ui/button";
import { Label } from "@317/ui-common/components/ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@317/ui-common/components/responsive-dialog";
import { Order } from "@/lib/stores-types";
import { CadetSearchInput } from "@/components/cadet-search";
import { KIT_ITEMS } from "./draft-item";

/**
 * Adds a new cadet to C Flight initial kitting: one of each item for their kit, sizes set later.
 * Holds its own form state, cleared each time it opens. Split out of the
 * uniform orders page, which had grown to 1,500 lines.
 */
export function KittingDialog({
  open,
  onOpenChange,
  token,
  onCreated,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | null;
  onCreated: (order: Order) => void;
  onError: (message: string) => void;
}) {
  const [kitCadetCin, setKitCadetCin] = useState<number | null>(null);
  const [kitCadetName, setKitCadetName] = useState("");
  const [kitGender, setKitGender] = useState<"male" | "female">("male");
  const [kitSubmitting, setKitSubmitting] = useState(false);

  // A fresh form every time it opens: reset while rendering the open, React's
  // pattern for state that follows a prop, so the last cadet doesn't flash up.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setKitCadetCin(null);
      setKitCadetName("");
      setKitGender("male");
    }
  }

  async function handleCreateKitting() {
    if (!kitCadetCin) return;
    setKitSubmitting(true);
    try {
      const items = KIT_ITEMS[kitGender].map((itemType) => ({
        itemType,
        size: "",
        needSizing: false,
        sizingDetails: "",
      }));
      const res = await fetch("/api/stores/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cadetCin: kitCadetCin, kitting: true, items }),
      });
      if (!res.ok) throw new Error("Failed to create kitting");
      const created = await res.json();
      onCreated(created);
      onOpenChange(false);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setKitSubmitting(false);
    }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Add cadet to C Flight kitting</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Cadet</Label>
            <CadetSearchInput
              token={token}
              selectedCin={kitCadetCin}
              selectedName={kitCadetName}
              onSelect={(cin, name) => {
                setKitCadetCin(cin || null);
                setKitCadetName(name);
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Kit</Label>
            <div className="flex gap-2">
              {(["male", "female"] as const).map((g) => (
                <Button
                  key={g}
                  type="button"
                  variant={kitGender === g ? "default" : "outline"}
                  size="sm"
                  className="flex-1 capitalize"
                  onClick={() => setKitGender(g)}
                >
                  {g}
                </Button>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              Pre-fills 1 of each: {KIT_ITEMS[kitGender].join(", ")}. Sizes are set later via Edit Size.
            </p>
          </div>
        </div>

        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreateKitting} disabled={kitSubmitting || !kitCadetCin}>
            {kitSubmitting ? "Adding..." : "Add cadet"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
