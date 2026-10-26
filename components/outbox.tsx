"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import { CloudUpload, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useConfirm } from "@/components/confirm-dialog";
import { formatTimestamp } from "@/lib/format";
import {
  discardQueued,
  flushOutbox,
  OUTBOX_EVENT,
  outboxFor,
  readOutbox,
  type OutboxItem,
} from "@/lib/outbox";

// How often to retry while something is waiting. The `online` event alone
// isn't enough: a phone can be "online" on a hall's wifi that goes nowhere.
const RETRY_MS = 30_000;

function subscribe(onChange: () => void) {
  window.addEventListener(OUTBOX_EVENT, onChange);
  // Another tab sending or queueing changes the same storage.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(OUTBOX_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The raw stored queue as a string, so React compares snapshots cheaply. */
function snapshot() {
  return JSON.stringify(readOutbox());
}

/** This person's queued submissions, kept up to date as they're queued and sent. */
export function useOutbox(): OutboxItem[] {
  const { data: session } = useSession();
  const owner = session?.user?.email;
  const raw = useSyncExternalStore(subscribe, snapshot, () => "[]");
  return useMemo(
    () => (owner ? (JSON.parse(raw) as OutboxItem[]).filter((i) => i.owner === owner) : []),
    [raw, owner]
  );
}

function plural(n: number, one: string) {
  return `${n} ${one}${n === 1 ? "" : "s"}`;
}

/**
 * Sends queued submissions (lib/outbox.ts) once there's signal: on load, when
 * the browser says it's back online, when the app comes back to the
 * foreground, and every 30s while anything is waiting. Renders nothing.
 */
export function OutboxSync() {
  const { data: session } = useSession();
  const token = session?.id_token;
  const owner = session?.user?.email;
  const waiting = useOutbox().filter((i) => !i.error).length;

  const flush = useCallback(async () => {
    if (!token || !owner || !outboxFor(owner).some((i) => !i.error)) return;
    const { sent, refused } = await flushOutbox(token, owner);
    if (sent.length) toast.success(`Sent ${plural(sent.length, "saved submission")} from this phone`);
    for (const item of refused) toast.error(`${item.label} wasn't accepted: ${item.error}`);
  }, [token, owner]);

  useEffect(() => {
    void flush();
    const onVisible = () => document.visibilityState === "visible" && void flush();
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [flush]);

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void flush(), RETRY_MS);
    return () => clearInterval(timer);
  }, [waiting, flush]);

  return null;
}

/**
 * Header button shown while submissions are waiting on this device, so
 * nobody closes the app thinking a sheet went when it didn't. Lists them,
 * with "Send now", and lets a refused one be discarded.
 */
export function OutboxIndicator() {
  const { data: session } = useSession();
  const items = useOutbox();
  const [sending, setSending] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  if (!items.length) return null;

  const refused = items.filter((i) => i.error).length;

  async function sendNow() {
    if (!session?.id_token || !session.user?.email) return;
    setSending(true);
    try {
      const { sent, refused } = await flushOutbox(session.id_token, session.user.email);
      if (sent.length) toast.success(`Sent ${plural(sent.length, "submission")}`);
      else if (!refused.length) toast.error("Still no connection to the server. It'll keep trying.");
      for (const item of refused) toast.error(`${item.label} wasn't accepted: ${item.error}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={refused ? "text-destructive border-destructive/40" : "text-warning border-warning/40"}
            aria-label={`${plural(items.length, "submission")} waiting to send`}
          >
            <CloudUpload />
            {items.length}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <PopoverHeader>
            <PopoverTitle>Waiting to send</PopoverTitle>
            <PopoverDescription>
              Saved on this device without signal. They send by themselves when you&apos;re back online.
            </PopoverDescription>
          </PopoverHeader>
          <ul className="flex flex-col divide-y text-sm">
            {items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-2 py-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">{item.label}</span>
                  <span className="text-muted-foreground text-xs">
                    Saved {formatTimestamp(item.queuedAt)}
                  </span>
                  {item.error && <span className="text-destructive text-xs">Not accepted: {item.error}</span>}
                </div>
                {item.error && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    aria-label={`Discard ${item.label}`}
                    onClick={() =>
                      confirm(`Discard ${item.label}? It was never saved on the server.`, () =>
                        discardQueued(item.id)
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {items.length > refused && (
            <Button className="h-9 w-full" onClick={sendNow} disabled={sending}>
              {sending ? "Sending…" : "Send now"}
            </Button>
          )}
        </PopoverContent>
      </Popover>
      {confirmDialog}
    </>
  );
}
