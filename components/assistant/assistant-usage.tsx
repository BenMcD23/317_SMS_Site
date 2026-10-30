"use client";

import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { Private } from "@/components/private";
import { Stat, StatGroup } from "@/components/stat";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTimestamp } from "@/lib/format";
import { useApiQuery } from "@/lib/use-api-query";

export type AssistantUsage = {
  days: number;
  questions: number;
  people: number;
  per_day: { date: string; questions: number }[];
  by_person: { email: string; questions: number }[];
  tools: { tool: string; calls: number }[];
  fallback: number;
  thumbs_up: number;
  thumbs_down: number;
  rated_down: { date: string; email: string; question: string; answer: string }[];
};

/**
 * The assistant's tab on the owner's Usage page: how much it's used, which
 * tools it reaches for, how often the backup model answered, and the answers
 * people marked wrong, which is how bad answers get found and fixed. Owner
 * only, like the rest of the page; the API enforces it too.
 */
export function AssistantUsageView({ days }: { days: string }) {
  const { data, error, isLoading } = useApiQuery<AssistantUsage>(
    ["assistant-usage", days],
    `/assistant/usage?days=${days}`
  );

  if (error) return <ErrorAlert title="Couldn't load the assistant's usage" message={error.message} />;
  if (isLoading || !data) return <ListSkeleton rows={4} />;
  if (data.questions === 0)
    return (
      <p className="text-muted-foreground py-4 text-sm">
        Nobody asked the assistant anything in the last {data.days} days.
      </p>
    );

  return (
    <div className="flex flex-col gap-6 pt-2">
      <StatGroup>
        <Stat label="Questions" value={data.questions} />
        <Stat label="People" value={data.people} />
        <Stat label="Good answers" value={data.thumbs_up} />
        <Stat label="Bad answers" value={data.thumbs_down} tone={data.thumbs_down ? "warning" : undefined} />
        <Stat label="Backup model" value={data.fallback} hint="answers the backup model gave" />
      </StatGroup>

      <section aria-labelledby="assistant-bad" className="flex flex-col gap-2">
        <h2 id="assistant-bad" className="text-sm font-semibold">
          Answers marked bad
        </h2>
        {data.rated_down.length === 0 ? (
          <p className="text-muted-foreground text-sm">None in this period.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {data.rated_down.map((r, i) => (
              <li key={i} className="flex flex-col gap-1 px-4 py-3">
                <p className="text-sm font-medium">{r.question}</p>
                <p className="text-muted-foreground text-sm whitespace-pre-wrap">{r.answer}</p>
                <p className="text-muted-foreground text-xs">
                  {formatTimestamp(r.date)}
                  <Private> · {r.email}</Private>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="assistant-tools" className="flex flex-col gap-2">
        <h2 id="assistant-tools" className="text-sm font-semibold">
          What it looked up
        </h2>
        <Table aria-labelledby="assistant-tools">
          <TableHeader>
            <TableRow>
              <TableHead>Tool</TableHead>
              <TableHead className="text-right">Times</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.tools.map((t) => (
              <TableRow key={t.tool}>
                <TableCell className="font-mono text-xs">{t.tool}</TableCell>
                <TableCell className="text-right tabular-nums">{t.calls}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {/* Listed by email alone, so it goes while personal data is hidden. */}
      <Private>
        <section aria-labelledby="assistant-people" className="flex flex-col gap-2">
          <h2 id="assistant-people" className="text-sm font-semibold">
            Who asks
          </h2>
          <Table aria-labelledby="assistant-people">
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Questions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.by_person.map((p) => (
                <TableRow key={p.email}>
                  <TableCell>{p.email}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.questions}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </Private>
    </div>
  );
}
