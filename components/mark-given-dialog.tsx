"use client";

import type { ReactNode } from "react";
import { PackageCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";

/**
 * The "Mark as Given" check before an item is recorded as handed over. Shared
 * by the uniform and badge order pages; each says what giving does on its side
 * (a uniform give also updates the cadet's issuance record) through `children`.
 */
export function MarkGivenDialog({
  open,
  onOpenChange,
  busy,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A give is in flight: the confirm button waits. */
  busy: boolean;
  onConfirm: () => void;
  children: ReactNode;
}) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-sm">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Mark as Given</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-3 text-sm">
          {children}
          {/* Giving can be undone from the item while the order is open. */}
          <p className="text-muted-foreground">You can undo this while the order is still open.</p>
        </div>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-success hover:bg-success/90 text-white" onClick={onConfirm} disabled={busy}>
            <PackageCheck className="mr-2 h-4 w-4" />
            Mark as Given
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
