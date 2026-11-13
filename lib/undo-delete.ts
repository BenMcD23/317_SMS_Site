import { toast } from "sonner";

/** How long the Undo stays offered before the delete is sent. */
export const UNDO_MS = 5000;

/**
 * Delete something with an Undo instead of an "Are you sure?" first. For
 * small things in a list (a note, a target), where a confirm is one more tap
 * every time and a mis-tap is the only real risk: the item goes at once,
 * a toast offers Undo, and the DELETE is only sent once the toast has gone.
 * So Undo needs no server support, and closing the tab inside the window
 * keeps the item, which is the safe way round. Keep `useConfirm` for
 * anything big or that reaches other people (records, emails, Bader).
 *
 * `hide` takes the item out of view; `restore` puts it back (after Undo, or
 * if the delete fails, with the API's reason in an error toast).
 */
export function deleteWithUndo({
  message,
  hide,
  restore,
  commit,
  failMessage = "Couldn't delete that.",
}: {
  message: string;
  hide: () => void;
  restore: () => void;
  commit: () => Promise<unknown>;
  failMessage?: string;
}): void {
  hide();
  let undone = false;
  const timer = setTimeout(async () => {
    if (undone) return;
    try {
      await commit();
    } catch (e) {
      restore();
      toast.error(e instanceof Error ? e.message : failMessage);
    }
  }, UNDO_MS);
  toast(message, {
    duration: UNDO_MS,
    action: {
      label: "Undo",
      onClick: () => {
        undone = true;
        clearTimeout(timer);
        restore();
      },
    },
  });
}
