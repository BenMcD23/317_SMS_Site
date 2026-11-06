"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { CheckCircle2, SearchX, Users } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { Stat, StatGroup } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { flightBadgeClass } from "@/lib/cadet-format";
import { checkedInHow, checkIn, undoCheckIn, type DoorCadet, type DoorList } from "@/lib/check-ins";
import { formatTime } from "@/lib/format";
import { useApiQuery, useSetApiQueryData } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

type Show = "waiting" | "in" | "all";

const KEY = ["check-ins", "tonight"] as const;

function matches(c: DoorCadet, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${c.first_name} ${c.last_name} ${c.last_name}, ${c.first_name}`.toLowerCase().includes(q);
}

function DoorRow({
  cadet,
  busy,
  onCheckIn,
  onUndo,
}: {
  cadet: DoorCadet;
  busy: boolean;
  onCheckIn: () => void;
  onUndo: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">
            {cadet.last_name}, {cadet.first_name}
          </span>
          {cadet.rank && <span className="text-muted-foreground text-xs">{cadet.rank}</span>}
          {cadet.flight && (
            <Badge variant="outline" className={cn("text-[11px]", flightBadgeClass(cadet.flight))}>
              {cadet.flight}
            </Badge>
          )}
        </span>
        {cadet.checked_in && cadet.checked_in_at && (
          <span className="text-success flex items-center gap-1 text-xs">
            <CheckCircle2 className="size-3" aria-hidden />
            In at {formatTime(cadet.checked_in_at)} {checkedInHow(cadet)}
          </span>
        )}
      </div>
      {cadet.checked_in ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-9"
          disabled={busy}
          onClick={onUndo}
          aria-label={`Take ${cadet.first_name} ${cadet.last_name}'s check-in off`}
        >
          Undo
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          disabled={busy}
          onClick={onCheckIn}
          aria-label={`Check in ${cadet.first_name} ${cadet.last_name}`}
        >
          Check in
        </Button>
      )}
    </li>
  );
}

/**
 * Tonight's door list. Cadets check themselves in with the QR code or NFC tag
 * (the portal); an NCO ticks in anyone without their phone here, and can take
 * a wrong one off. It refreshes while open so the list keeps up with the door.
 * A head count for the session planner, not the register.
 */
export function DoorList() {
  const { data: session } = useSession();
  const token = session?.id_token;
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("waiting");
  const [busy, setBusy] = useState<number | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const listQuery = useApiQuery<DoorList>(KEY, "/check-ins", { refetchInterval: 15_000 });
  const setList = useSetApiQueryData<DoorList>(KEY);
  const list = listQuery.data && Array.isArray(listQuery.data.cadets) ? listQuery.data : null;

  const shown = useMemo(
    () =>
      (list?.cadets ?? []).filter(
        (c) => matches(c, query) && (show === "all" || (show === "in") === c.checked_in)
      ),
    [list, query, show]
  );

  function replace(row: DoorCadet) {
    setList((prev) => {
      if (!prev) return prev;
      const cadets = prev.cadets.map((c) => (c.cin === row.cin ? row : c));
      return { ...prev, cadets, checked_in: cadets.filter((c) => c.checked_in).length };
    });
  }

  async function tickIn(c: DoorCadet) {
    if (!token) return;
    setBusy(c.cin);
    try {
      const row = await checkIn(token, c.cin);
      replace({ ...c, ...row });
      toast.success(
        row.already
          ? `${c.first_name} ${c.last_name} was already in.`
          : `${c.first_name} ${c.last_name} checked in.`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't check them in.");
    } finally {
      setBusy(null);
    }
  }

  function undo(c: DoorCadet) {
    confirm(
      `Take ${c.first_name} ${c.last_name}'s check-in off? The Bader register isn't changed.`,
      async () => {
        if (!token) return;
        setBusy(c.cin);
        try {
          await undoCheckIn(token, c.cin);
          replace({ ...c, checked_in: false, checked_in_at: null, checked_in_by: null });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Couldn't take it off.");
          // Someone else may have changed it; show what's really there.
          listQuery.refetch();
        } finally {
          setBusy(null);
        }
      }
    );
  }

  if (listQuery.isPending) return <ListSkeleton rows={8} />;
  if (listQuery.isError || !list) {
    return <ErrorAlert message={listQuery.error?.message ?? "The door list didn't load."} />;
  }
  if (list.cadets.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No cadets on the roster"
        description="Cadets appear here once the roster has been scraped from Bader."
      />
    );
  }

  const waiting = list.cadets.length - list.checked_in;
  return (
    <div className="flex flex-col gap-4">
      <StatGroup>
        <Stat label="Checked in" value={list.checked_in} size="lg" tone="success" />
        <Stat label="Not here yet" value={waiting} size="lg" />
      </StatGroup>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor="door-search">Find a cadet</Label>
          <Input
            id="door-search"
            type="search"
            placeholder="Name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Show"
          className="h-9"
          value={show}
          onValueChange={(v) => v && setShow(v as Show)}
        >
          <ToggleGroupItem value="waiting" className="px-3">
            Not here yet
          </ToggleGroupItem>
          <ToggleGroupItem value="in" className="px-3">
            Checked in
          </ToggleGroupItem>
          <ToggleGroupItem value="all" className="px-3">
            Everyone
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={query.trim() ? SearchX : CheckCircle2}
          title={query.trim() ? "Nobody by that name" : show === "waiting" ? "Everyone's in" : "Nobody yet"}
          description={
            query.trim()
              ? "Check the spelling, or look under Everyone."
              : show === "waiting"
                ? "Every cadet on the roster has checked in."
                : "No one has checked in tonight."
          }
        />
      ) : (
        <ul className="bg-card divide-y rounded-lg border">
          {shown.map((c) => (
            <DoorRow
              key={c.cin}
              cadet={c}
              busy={busy === c.cin}
              onCheckIn={() => tickIn(c)}
              onUndo={() => undo(c)}
            />
          ))}
        </ul>
      )}
      {confirmDialog}
    </div>
  );
}
