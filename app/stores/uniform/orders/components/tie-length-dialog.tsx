"use client";

import { Button } from "@317/ui-common/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@317/ui-common/components/responsive-dialog";

export type TieLength = "Short" | "Standard";

/**
 * Asks which necktie to demand before a tie goes on the logs form. A tie is
 * ordered with no size, but the logs form demands a length (the API refuses
 * an entry without one).
 */
export function TieLengthDialog({
  open,
  onChoose,
  onClose,
}: {
  open: boolean;
  onChoose: (length: TieLength) => void;
  onClose: () => void;
}) {
  function choose(length: TieLength) {
    onChoose(length);
    onClose();
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <ResponsiveDialogContent className="sm:max-w-sm">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Necktie Length</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <p className="text-muted-foreground text-sm">Which necktie should be demanded on the logs form?</p>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => choose("Short")}>
            Short
          </Button>
          <Button onClick={() => choose("Standard")}>Standard</Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
