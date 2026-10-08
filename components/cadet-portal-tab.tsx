"use client";
import Link from "next/link";

import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatTimestamp } from "@/lib/format";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";
import { FIELDCRAFT_LEVELS, formatMinutes, type CadetPortalData } from "@/lib/vp-sync";

// Long histories (a keen cadet's flying log) are cut to the latest few here;
// the full record stays on the Volunteer Portal.
const RECENT = 8;

/**
 * One cadet's Volunteer Portal data, on the cadet page's "Portal" tab. Lists,
 * not tables, so each card reads on a phone without sideways scrolling.
 */
export function CadetPortalTab({ cin }: { cin: string }) {
  const { data, isLoading, error } = useApiQuery<CadetPortalData>(["vp", "cadet", cin], `/vp/cadets/${cin}`);

  if (isLoading) return <ListSkeleton rows={6} />;
  if (error || !data) return <ErrorAlert message={error?.message ?? null} title="Could not load portal data" />;
  if (!data.synced_at) {
    return (
      <Card>
        <CardContent className="text-muted-foreground text-sm">
          Not synced from the Volunteer Portal yet —{" "}
          <Link href="/tools/scraper" className="text-primary hover:underline">
            run the 317 Sync
          </Link>
          .
        </CardContent>
      </Card>
    );
  }

  const exams = data.exams;
  const flightMinutes = (data.flying ?? []).reduce((n, f) => n + (f.minutes ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">Synced from the Volunteer Portal {formatTimestamp(data.synced_at)}.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Classification" items={data.classification}>
          {(s) => <Row key={s.name} label={s.name} value={s.date ? formatDate(s.date) : "Not yet"} muted={!s.date} />}
        </Section>

        <Section title="Weapon handling tests" items={data.whts}>
          {(w) => (
            <Row
              key={w.weapon}
              label={w.weapon}
              value={w.expires ? `expires ${formatDate(w.expires)}` : w.status}
              muted={!!w.expires && w.expires < new Date().toISOString().slice(0, 10)}
            />
          )}
        </Section>

        <Section
          title="Classification exams"
          items={
            exams && [
              ...exams.results,
              // An enrolment is named for the subject ("Rocketry") and its result
              // for the exam ("Rocketry Exam"); once there's a result, skip the enrolment.
              ...exams.enrolments
                .filter((e) => !exams.results.some((r) => r.course.toLowerCase().startsWith(e.course.toLowerCase())))
                .map((e) => ({ ...e, status: "enrolled", date: e.enrolled_on })),
            ]
          }
        >
          {(r, i) => (
            <Row
              key={i}
              label={r.course}
              value={
                <Badge variant={r.status === "completed" ? "default" : "outline"}>
                  {r.status === "completed" ? "Passed" : r.status === "in_progress" ? "In progress" : "Enrolled"}
                </Badge>
              }
            />
          )}
        </Section>

        <Section
          title="Fieldcraft lessons"
          items={data.fieldcraft && FIELDCRAFT_LEVELS.filter((l) => data.fieldcraft!.some((f) => f.level === l))}
        >
          {(level) => (
            <Row
              key={level}
              label={level}
              value={`${data.fieldcraft!.filter((f) => f.level === level).length} lessons`}
            />
          )}
        </Section>

        <Section
          title={`Flying${data.flying?.length ? ` · ${data.flying.length} sorties, ${formatMinutes(flightMinutes)}` : ""}`}
          items={data.flying?.slice(0, RECENT)}
        >
          {(f, i) => (
            <Row
              key={i}
              label={`${formatDate(f.date)} · ${f.activity}`}
              value={[f.aircraft, f.minutes != null && formatMinutes(f.minutes)].filter(Boolean).join(" · ")}
            />
          )}
        </Section>

        <Section title="Shooting log" items={data.shooting_log?.slice(0, RECENT)}>
          {(s, i) => (
            <Row
              key={i}
              label={`${formatDate(s.date)} · ${s.weapon}`}
              value={[s.practice, s.score && `${s.score}${s.max_score ? `/${s.max_score}` : ""}`, s.outcome]
                .filter(Boolean)
                .join(" · ")}
            />
          )}
        </Section>

        <Section title="E-learning" items={data.learning?.slice(0, RECENT)}>
          {(l, i) => (
            <Row key={i} label={l.title} value={l.complete ? "Complete" : "Not complete"} muted={!l.complete} />
          )}
        </Section>

        <Section title="Unit history" items={data.unit_history}>
          {(u, i) => (
            <Row key={i} label={u.unit} value={`${formatDate(u.start)} – ${u.end ? formatDate(u.end) : "now"}`} />
          )}
        </Section>
      </div>
    </div>
  );
}

/** A card listing `items`; null means the portal read failed or never ran. */
function Section<T>({
  title,
  items,
  children,
}: {
  title: string;
  items: T[] | null | undefined;
  children: (item: T, index: number) => React.ReactNode;
}) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items == null ? (
          <p className="text-muted-foreground text-sm">Not synced — the portal didn&apos;t return this.</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm">None recorded.</p>
        ) : (
          <ul className="divide-y text-sm">{items.map(children)}</ul>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, muted }: { label: React.ReactNode; value: React.ReactNode; muted?: boolean }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <span className="min-w-0 break-words">{label}</span>
      <span className={cn("shrink-0 text-right", muted && "text-muted-foreground")}>{value}</span>
    </li>
  );
}
