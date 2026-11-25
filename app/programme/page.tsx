"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarRange, ChevronRight, MessageSquare, Plus } from "lucide-react";

import { EmptyState } from "@317/ui-common/components/empty-state";
import { ErrorAlert } from "@317/ui-common/components/error-alert";
import { PageHeader } from "@317/ui-common/components/page-header";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@317/ui-common/components/responsive-dialog";
import { Badge } from "@317/ui-common/components/ui/badge";
import { Button } from "@317/ui-common/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@317/ui-common/components/ui/select";
import { DividedGrid } from "@/components/divided-grid";
import { ListSkeleton } from "@/components/list-skeleton";
import { MonthPicker, type MonthValue } from "@/components/month-picker";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatRelative } from "@/lib/format";
import { useApiQuery } from "@/lib/use-api-query";
import {
  monthName,
  PROGRAMME_KEYS,
  programmeApi,
  STATUS_LABELS,
  type MonthList,
} from "@/lib/programme-builder";

const pad = (n: number) => String(n).padStart(2, "0");
const toKey = (v: MonthValue) => `${v.year}-${pad(v.month)}`;
const fromKey = (k: string): MonthValue => ({ year: Number(k.slice(0, 4)), month: Number(k.slice(5, 7)) });

/**
 * Every month's programme: what's being built, what's out, and how many
 * comments are waiting. Staff start a month here; everyone opens one.
 */
export default function ProgrammePage() {
  const { data: session } = useSession();
  const canEdit = session?.role === "staff";
  const query = useApiQuery<MonthList>(PROGRAMME_KEYS.months, "/programme-builder/months");
  const [creating, setCreating] = useState(false);
  const programmes = query.data?.programmes ?? [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Programme"
        description={
          canEdit
            ? "Build each month's parade nights from the session bank, then publish it to the website."
            : "Each month's parade nights. Comment on anything to ask staff about it."
        }
        actions={
          canEdit && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New programme
            </Button>
          )
        }
      />

      <ErrorAlert message={query.error?.message} title="Couldn't load the programmes" />
      {query.isLoading ? (
        <ListSkeleton rows={4} className="h-20" />
      ) : !query.error && programmes.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No programmes yet"
          description={
            canEdit
              ? "Start next month's from its parade nights, or from the programme doc it was imported from."
              : "Staff haven't started one yet."
          }
        >
          {canEdit && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New programme
            </Button>
          )}
        </EmptyState>
      ) : (
        programmes.length > 0 && (
          <DividedGrid as="ul" className="grid-cols-1 sm:grid-cols-2" aria-label="Programmes">
            {programmes.map((p) => (
              <li key={p.month}>
                <Link
                  href={`/programme/${p.month}`}
                  className="hover:bg-muted/50 flex min-h-20 items-center gap-3 p-4 transition-colors"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{monthName(p.month)}</span>
                      <Badge variant={p.status === "published" ? "default" : "outline"}>
                        {STATUS_LABELS[p.status]}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {p.nights} night{p.nights === 1 ? "" : "s"}, {p.sessions} session
                      {p.sessions === 1 ? "" : "s"}
                      {p.updated_by && ` · ${p.updated_by}, ${formatRelative(p.updated_at).toLowerCase()}`}
                    </p>
                  </div>
                  {p.open_comments > 0 && (
                    <span
                      className="text-primary flex items-center gap-1 text-sm"
                      aria-label={`${p.open_comments} open comments`}
                    >
                      <MessageSquare className="size-4" />
                      {p.open_comments}
                    </span>
                  )}
                  <ChevronRight className="text-muted-foreground size-4" aria-hidden />
                </Link>
              </li>
            ))}
          </DividedGrid>
        )
      )}

      {canEdit && (
        <p className="text-muted-foreground text-sm">
          Still using the Google Doc this month?{" "}
          <Link href="/tools/programme-updater" className="text-primary underline-offset-4 hover:underline">
            Publish it from Drive
          </Link>
          .
        </p>
      )}

      {creating && query.data && <NewProgrammeDialog list={query.data} onOpenChange={setCreating} />}
    </div>
  );
}

/** Start a month: its parade nights empty, what the record has for it, or a copy of another. */
function NewProgrammeDialog({
  list,
  onOpenChange,
}: {
  list: MonthList;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const built = new Set(list.programmes.map((p) => p.month));
  const today = new Date();
  const fallback = toKey({
    month: ((today.getMonth() + 1) % 12) + 1,
    year: today.getFullYear() + (today.getMonth() === 11 ? 1 : 0),
  });
  const [month, setMonth] = useState<MonthValue>(fromKey(list.next_month ?? fallback));
  const key = toKey(month);
  const inRecord = list.record_months.includes(key);
  const [start, setStart] = useState<"empty" | "record" | "copy">("empty");
  const [copyFrom, setCopyFrom] = useState(list.programmes[0]?.month ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exists = built.has(key);
  const choice = start === "record" && !inRecord ? "empty" : start;

  return (
    <ResponsiveDialog open onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>New programme</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            It starts with the month&apos;s parade nights. Nothing goes out until you publish it.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="flex flex-col gap-4">
          <MonthPicker value={month} onChange={setMonth} label="Month" />
          {exists && <p className="text-destructive text-sm">That month already has a programme.</p>}
          <Field>
            <FieldLabel id="start-label">Start from</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              aria-labelledby="start-label"
              value={choice}
              onValueChange={(v) => v && setStart(v as typeof start)}
              className="flex-wrap"
            >
              <ToggleGroupItem value="empty" className="px-3">
                Empty nights
              </ToggleGroupItem>
              {inRecord && (
                <ToggleGroupItem value="record" className="px-3">
                  The imported doc
                </ToggleGroupItem>
              )}
              {list.programmes.length > 0 && (
                <ToggleGroupItem value="copy" className="px-3">
                  Another month
                </ToggleGroupItem>
              )}
            </ToggleGroup>
            <FieldDescription>
              {choice === "record"
                ? "What the Google Doc import has for the month, ready to change."
                : choice === "copy"
                  ? "Week 1 from week 1, week 2 from week 2, and so on."
                  : "Empty nights, ready for sessions from the bank."}
            </FieldDescription>
          </Field>
          {choice === "copy" && (
            <Field>
              <FieldLabel htmlFor="copy-from">Copy</FieldLabel>
              <Select value={copyFrom} onValueChange={setCopyFrom}>
                <SelectTrigger id="copy-from" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {list.programmes.map((p) => (
                    <SelectItem key={p.month} value={p.month}>
                      {monthName(p.month)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <ErrorAlert message={error} title="Not started" />
        </div>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={busy || exists}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await programmeApi.createMonth(
                  session!.id_token!,
                  key,
                  choice,
                  choice === "copy" ? copyFrom : undefined
                );
                await queryClient.invalidateQueries({ queryKey: PROGRAMME_KEYS.months });
                router.push(`/programme/${key}`);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Couldn't start it.");
                setBusy(false);
              }
            }}
          >
            {busy ? "Starting…" : `Start ${monthName(key)}`}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
