"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Destructive-action confirmation dialog, shared by the pages that used to
 * hand-roll the same open/message/pendingAction state.
 *
 * Usage:
 *   const { confirm, confirmDialog } = useConfirm();
 *   ...
 *   confirm("Delete this order?", () => deleteOrder(id));
 *   ...
 *   return <div>...{confirmDialog}</div>;
 */
export function useConfirm() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [action, setAction] = useState<(() => void) | null>(null);

  const confirm = useCallback((msg: string, act: () => void) => {
    setMessage(msg);
    setAction(() => act);
    setOpen(true);
  }, []);

  const confirmDialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Are you sure?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{message}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => {
              action?.();
              setOpen(false);
            }}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirm, confirmDialog };
}
