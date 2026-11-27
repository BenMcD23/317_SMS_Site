"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, Trash2, UserPlus } from "lucide-react";

import { useConfirm } from "@/components/confirm-dialog";
import { DividedGrid } from "@/components/divided-grid";
import { ListSkeleton } from "@/components/list-skeleton";
import { Private } from "@/components/private";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@317/ui-common/components/ui/badge";
import { Button } from "@317/ui-common/components/ui/button";
import { Checkbox } from "@317/ui-common/components/ui/checkbox";
import { Input } from "@317/ui-common/components/ui/input";
import { Label } from "@317/ui-common/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@317/ui-common/components/ui/select";
import { EmptyState } from "@317/ui-common/components/empty-state";
import { ErrorAlert } from "@317/ui-common/components/error-alert";
import { PageHeader } from "@317/ui-common/components/page-header";
import { SectionHeading } from "@317/ui-common/components/section-heading";
import { formatTimestamp, todayLocal } from "@/lib/format";
import {
  addRecipient,
  buildReport,
  personLabel,
  removeRecipient,
  ROLE_LABEL,
  scheduleText,
  setReportsEnabled,
  type ParadeReportSettings,
  type ReportPerson,
} from "@/lib/parade-reports";
import { useApiQuery } from "@/lib/use-api-query";

const KEY = ["parade-reports", "settings"];

export default function ParadeReportSettingsPage() {
  const { data: session } = useSession();
  const token = session?.id_token;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const { data, isLoading, error } = useApiQuery<ParadeReportSettings>(KEY, "/api/parade-reports/settings");

  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState("");
  const [night, setNight] = useState(todayLocal());
  const [emailIt, setEmailIt] = useState(false);

  // Every write answers with the whole settings, so the page shows exactly
  // what the API now holds rather than guessing.
  const save = async (write: () => Promise<ParadeReportSettings>, done: string) => {
    if (!token) return;
    setBusy(true);
    try {
      queryClient.setQueryData(KEY, await write());
      toast.success(done);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onRemove = (person: ReportPerson) =>
    confirm(
      `Take ${personLabel(person)} off the list? They stop getting the email and can't open the reports.`,
      () => save(() => removeRecipient(token!, person.email), `${personLabel(person)} taken off the list`)
    );

  const onAdd = async () => {
    if (!picked) return;
    if (await save(() => addRecipient(token!, picked), "Added to the list")) setPicked("");
  };

  const onBuild = async () => {
    if (!token || !night) return;
    setBusy(true);
    try {
      const report = await buildReport(token, night, emailIt);
      await queryClient.invalidateQueries({ queryKey: ["parade-reports"] });
      toast.success(emailIt ? "Report built and emailed" : "Report built");
      router.push(`/attendance/reports/${report.date}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't build the report.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      <PageHeader
        title="Parade Report Settings"
        description="Who gets the parade-night attendance report, and whether it runs."
      />

      {isLoading ? (
        <ListSkeleton rows={3} className="h-16" />
      ) : error || !data ? (
        <ErrorAlert
          message={error?.message ?? "No settings came back."}
          title="Could not load the settings"
        />
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <SectionHeading title="Schedule" />
            <div className="bg-card flex items-start justify-between gap-4 rounded-lg border p-4">
              <div className="flex min-w-0 flex-col gap-1">
                <Label htmlFor="reports-enabled" className="text-base">
                  Send the report after parade
                </Label>
                <p className="text-muted-foreground text-sm text-pretty">
                  At {scheduleText(data.schedule)}, the cadet scraper reads Bader, then the night&apos;s cadet
                  register is saved and emailed to the list. A night with no parade register sends nothing.
                </p>
                <p className="text-muted-foreground text-sm text-pretty">
                  {data.runsAs ? (
                    <>
                      Scrapes with{" "}
                      <Private>
                        <span className="text-foreground">{data.runsAs}</span>&apos;s
                      </Private>{" "}
                      Bader login. Switching it on makes it yours.
                    </>
                  ) : (
                    "Scrapes with the Bader login of whoever switches it on, saved in Settings."
                  )}
                </p>
                {data.updatedAt && (
                  <p className="text-muted-foreground text-xs">
                    Last changed {formatTimestamp(data.updatedAt)}
                  </p>
                )}
              </div>
              <Switch
                id="reports-enabled"
                checked={data.enabled}
                disabled={busy}
                onCheckedChange={(on) =>
                  save(
                    () => setReportsEnabled(token!, on),
                    on ? "Parade report switched on" : "Parade report switched off"
                  )
                }
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeading
              title={`Who gets it (${data.recipients.length})`}
              description="They're emailed each report and can open past ones here. Staff can always open them."
            />
            {data.recipients.length === 0 ? (
              <EmptyState
                icon={Mail}
                title="No one on the list"
                description="Add someone below to start sending it."
              />
            ) : (
              <DividedGrid as="ul" className="grid-cols-1" aria-label="Report recipients">
                {data.recipients.map((person) => (
                  <li
                    key={person.email}
                    className="bg-card flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{personLabel(person)}</span>
                      {person.name && (
                        <Private>
                          <span className="text-muted-foreground truncate text-sm">{person.email}</span>
                        </Private>
                      )}
                    </div>
                    {person.role ? (
                      <Badge variant="outline" className="font-normal">
                        {ROLE_LABEL[person.role] ?? person.role}
                      </Badge>
                    ) : (
                      // Taken out of the staff and NCO groups since: the email skips them.
                      <Badge variant="outline" className="border-warning/40 text-warning font-normal">
                        Not emailed: no longer staff or an NCO
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Remove ${personLabel(person)}`}
                      disabled={busy}
                      onClick={() => onRemove(person)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </DividedGrid>
            )}

            {/* Radix Select stays out of a <form>: inside one it echoes values back (see StockItemFields). */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="add-recipient">Add someone</Label>
              <div className="flex flex-wrap gap-2">
                <Select value={picked} onValueChange={setPicked} disabled={data.candidates.length === 0}>
                  <SelectTrigger id="add-recipient" className="min-w-0 flex-1 sm:max-w-sm">
                    <SelectValue
                      placeholder={data.candidates.length ? "Choose someone" : "Everyone is on the list"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {data.candidates.map((person) => (
                      <SelectItem key={person.email} value={person.email}>
                        {personLabel(person)}
                        {person.role ? ` (${ROLE_LABEL[person.role] ?? person.role})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button className="h-9" onClick={onAdd} disabled={!picked || busy}>
                  <UserPlus />
                  Add to list
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                Only staff, SNCOs and NCOs who have signed in to SMS at least once are listed.
              </p>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeading
              title="Build a report now"
              description="For a night the 21:30 run missed. Uses the attendance already scraped, so run the cadet scraper first if Bader has changed."
            />
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="report-night">Parade night</Label>
                <Input
                  id="report-night"
                  type="date"
                  value={night}
                  max={todayLocal()}
                  onChange={(e) => setNight(e.target.value)}
                  className="w-44"
                />
              </div>
              <div className="flex h-9 items-center gap-2">
                <Checkbox
                  id="report-email"
                  checked={emailIt}
                  onCheckedChange={(v) => setEmailIt(v === true)}
                />
                <Label htmlFor="report-email">Email it to the list</Label>
              </div>
              <Button variant="outline" className="h-9" onClick={onBuild} disabled={!night || busy}>
                Build report
              </Button>
            </div>
          </section>
        </>
      )}
      {confirmDialog}
    </div>
  );
}
