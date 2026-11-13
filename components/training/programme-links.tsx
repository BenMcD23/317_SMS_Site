"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Check, Link2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { SearchableSelect } from "@/components/searchable-select";
import { DataTable, dataTableColumns } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDate } from "@/lib/format";
import { categoriesOf, THEORY_KEYS } from "@/lib/theory";
import {
  acceptLinks,
  clearLink,
  lessonName,
  lessonValue,
  linkSummary,
  parseLesson,
  setLink,
  suggestLinks,
  TRAINING_KEYS,
  type ActivityLink,
  type CatalogueSubject,
  type LinkState,
} from "@/lib/training";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

type Filter = "review" | "linked" | "not_lesson" | "all";

const FILTERS: { value: Filter; label: string; match: (s: LinkState) => boolean }[] = [
  { value: "review", label: "To review", match: (s) => s === "suggested" || s === "none" },
  { value: "linked", label: "Lessons", match: (s) => s === "linked" },
  { value: "not_lesson", label: "Not lessons", match: (s) => s === "not_lesson" },
  { value: "all", label: "All", match: () => true },
];

const NOT_LESSON = "not_lesson";

/**
 * Change one activity's link: a lesson from the catalogue, or not a lesson.
 * "Forget" drops it so the next suggestion run looks at it again.
 */
function LinkDialog({
  row,
  subjects,
  onClose,
  onSave,
  onForget,
}: {
  row: ActivityLink | null;
  subjects: CatalogueSubject[];
  onClose: () => void;
  onSave: (row: ActivityLink, value: string) => Promise<void>;
  onForget: (row: ActivityLink) => Promise<void>;
}) {
  const initial = row
    ? lessonValue(row.subject_key, row.part) || (row.state === "not_lesson" ? NOT_LESSON : "")
    : "";
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function run(action: () => Promise<void>) {
    setSaving(true);
    try {
      await action();
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDialog open={!!row} onOpenChange={(open) => !open && onClose()}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{row?.activity}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Which lesson this is, whenever it&apos;s on the programme. Catch-ups and new nights use it.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <Field>
          <FieldLabel htmlFor="link-lesson">Lesson</FieldLabel>
          <SearchableSelect
            id="link-lesson"
            value={value}
            onValueChange={setValue}
            placeholder="Pick a lesson"
            searchPlaceholder="Find a lesson…"
            options={[
              { value: NOT_LESSON, label: "Not a lesson (drill, sport, socials…)" },
              ...categoriesOf(subjects).flatMap((category) =>
                subjects
                  .filter((s) => s.category === category)
                  .flatMap((s) =>
                    Array.from({ length: s.parts }, (_, i) => ({
                      value: `${s.key}:${i + 1}`,
                      label: lessonName(s.name, i + 1, s.parts),
                      group: category,
                    }))
                  )
              ),
            ]}
          />
          <FieldDescription>Not in the list? Add the subject on the QR codes tab first.</FieldDescription>
        </Field>
        <ResponsiveDialogFooter>
          {row && row.state !== "none" && (
            <Button
              variant="outline"
              className="sm:mr-auto"
              disabled={saving}
              onClick={() => run(() => onForget(row))}
            >
              Forget link
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!value || saving} onClick={() => row && run(() => onSave(row, value))}>
            {saving ? "Saving…" : "Save link"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function StateBadge({ row }: { row: ActivityLink }) {
  if (row.broken) {
    return (
      <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
        Subject retired
      </Badge>
    );
  }
  if (row.state === "suggested") {
    return (
      <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
        Suggested
      </Badge>
    );
  }
  return null;
}

const col = dataTableColumns<ActivityLink>();

/**
 * The Programme links tab: every activity the programme has had, and which
 * lesson it is. Suggestions come from the model (or simple rules when it's
 * down) and wait here until someone accepts or changes them; only accepted
 * links feed catch-ups and the night's lesson groups.
 */
export function ProgrammeLinks() {
  const { data: auth } = useSession();
  const token = auth?.id_token ?? "";
  const [filter, setFilter] = useState<Filter>("review");
  const [editing, setEditing] = useState<ActivityLink | null>(null);
  const [opened, setOpened] = useState(0);
  const [busy, setBusy] = useState(false);

  const linksQuery = useApiQuery<ActivityLink[]>(TRAINING_KEYS.links, "/training/links");
  const subjectsQuery = useApiQuery<CatalogueSubject[]>(THEORY_KEYS.subjects, "/cadets/theory/lessons");
  const rows = useMemo(() => linksQuery.data ?? [], [linksQuery.data]);
  const subjects = useMemo(() => subjectsQuery.data ?? [], [subjectsQuery.data]);

  const unlinked = rows.filter((r) => r.state === "none").length;
  const suggested = rows.filter((r) => r.state === "suggested");
  const match = FILTERS.find((f) => f.value === filter)!.match;
  const shown = rows.filter((r) => match(r.state));

  async function refresh() {
    await Promise.all([linksQuery.refetch(), subjectsQuery.refetch()]);
  }

  async function act(run: () => Promise<void>) {
    setBusy(true);
    try {
      await run();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const suggest = () =>
    act(async () => {
      const res = await suggestLinks(token);
      toast.success(
        res.suggested === 0
          ? "Every activity already has a link or a suggestion."
          : `${res.suggested} suggestion${res.suggested === 1 ? "" : "s"} to review`
      );
    });

  const accept = (activities: string[]) =>
    act(async () => {
      const res = await acceptLinks(token, activities);
      const made = res.created_subjects.length
        ? ` Added ${res.created_subjects.join(", ")} to the QR codes.`
        : "";
      toast.success(`${res.accepted} accepted.${made}`);
      for (const s of res.skipped) toast.error(`${s.activity}: ${s.reason}`);
    });

  async function save(row: ActivityLink, value: string) {
    const { subject_key, part } =
      value === NOT_LESSON ? { subject_key: null, part: null } : parseLesson(value);
    try {
      await setLink(token, row.activity, subject_key, part);
      toast.success(`${row.activity} saved`);
      setEditing(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the link.");
    }
  }

  async function forget(row: ActivityLink) {
    try {
      await clearLink(token, row.activity);
      toast.success(`${row.activity} unlinked`);
      setEditing(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't forget the link.");
    }
  }

  const columns = [
    col.accessor("activity", {
      header: "Activity",
      cell: (c) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{c.row.original.activity}</span>
          <span className="text-muted-foreground text-xs">
            {c.row.original.nights} night{c.row.original.nights === 1 ? "" : "s"} · last{" "}
            {formatDate(c.row.original.last)}
          </span>
        </div>
      ),
    }),
    col.accessor((r) => linkSummary(r, subjects), {
      id: "lesson",
      header: "Lesson",
      cell: (c) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn(c.row.original.state !== "linked" && "text-muted-foreground")}>
            {c.getValue()}
          </span>
          <StateBadge row={c.row.original} />
        </div>
      ),
    }),
    col.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: (c) => (
        <div className="flex flex-wrap justify-end gap-2">
          {c.row.original.state === "suggested" && (
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={busy}
              onClick={() => accept([c.row.original.activity])}
              aria-label={`Accept the suggestion for ${c.row.original.activity}`}
            >
              <Check />
              Accept
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => {
              setEditing(c.row.original);
              setOpened((n) => n + 1);
            }}
            aria-label={`Change the link for ${c.row.original.activity}`}
          >
            Change
          </Button>
        </div>
      ),
    }),
  ];

  const error = linksQuery.error?.message ?? subjectsQuery.error?.message;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading
        title="Programme links"
        description="Which lesson each programme activity is. Accepted links drive catch-ups and starting a night from the programme."
        actions={
          <>
            {suggested.length > 0 && (
              <Button
                variant="outline"
                className="h-9"
                disabled={busy}
                onClick={() => accept(suggested.map((r) => r.activity))}
              >
                <Check />
                Accept all {suggested.length}
              </Button>
            )}
            <Button className="h-9" disabled={busy || unlinked === 0} onClick={suggest}>
              <Sparkles />
              {busy ? "Working…" : unlinked ? `Suggest links for ${unlinked}` : "All suggested"}
            </Button>
          </>
        }
      />

      <ErrorAlert message={error} title="Couldn't load the links" />
      {linksQuery.isLoading && <ListSkeleton rows={6} />}

      {linksQuery.data && rows.length === 0 && (
        <EmptyState
          icon={Link2}
          title="No programme imported yet"
          description="Import some months of the programme, then come back to link its activities to lessons."
        >
          <Button asChild variant="outline">
            <Link href="/tools/programme-updater">Go to the programme</Link>
          </Button>
        </EmptyState>
      )}

      {rows.length > 0 && (
        <>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            aria-label="Show"
            className="flex-wrap justify-start"
            value={filter}
            onValueChange={(v) => v && setFilter(v as Filter)}
          >
            {FILTERS.map((f) => (
              <ToggleGroupItem key={f.value} value={f.value} className="px-3">
                {f.label} {rows.filter((r) => f.match(r.state)).length}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {shown.length === 0 ? (
            <EmptyState
              icon={Check}
              title="Nothing here"
              description="Pick another filter to see the rest."
            />
          ) : (
            <DataTable
              data={shown}
              columns={columns}
              rowKey={(r) => r.activity}
              label="Programme activities"
              columnClassName={{ actions: "w-0 text-right" }}
            />
          )}
        </>
      )}

      <LinkDialog
        key={opened}
        row={editing}
        subjects={subjects}
        onClose={() => setEditing(null)}
        onSave={save}
        onForget={forget}
      />
    </div>
  );
}
