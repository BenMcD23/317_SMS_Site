"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { CircleCheck, CircleMinus, BookUser, CircleX, Download, type LucideIcon } from "lucide-react";

import { Badge } from "@317/ui-common/components/ui/badge";
import { Button } from "@317/ui-common/components/ui/button";
import { EmptyState } from "@317/ui-common/components/empty-state";
import { ErrorAlert } from "@317/ui-common/components/error-alert";
import { OrderDisclosure, OrderList, OrderListSkeleton } from "@317/ui-common/components/order-disclosure";
import { PageHeader } from "@317/ui-common/components/page-header";
import { cn } from "@317/ui-common/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CadetLink } from "@/components/cadet-link";
import { FlightFilter } from "@/components/flight-filter";
import { Private } from "@/components/private";
import { Stat, StatGroup } from "@/components/stat";
import { apiFetch, errorDetail } from "@/lib/api-fetch";
import { flightsIn } from "@/lib/cadet-format";
import { API_BASE } from "@/lib/config";
import {
  CHECK_LABELS,
  CONTACT_AUDIT_KEY,
  contactAuditOrNull,
  filterCadets,
  resultCounts,
  type CheckState,
  type ContactAuditCadet,
  type ResultFilter,
} from "@/lib/contact-audit";
import { saveResponseAsFile } from "@/lib/download";
import { formatTimestamp } from "@/lib/format";
import { useApiQuery } from "@/lib/use-api-query";

const RESULT_BADGE: Record<ContactAuditCadet["result"], string> = {
  good: "border-success/40 bg-success/10 text-success",
  bad: "border-destructive/40 bg-destructive/10 text-destructive",
  not_checked: "text-muted-foreground",
};

const CHECK_ICON: Record<CheckState, { icon: LucideIcon; className: string }> = {
  good: { icon: CircleCheck, className: "text-success" },
  bad: { icon: CircleX, className: "text-destructive" },
  "n/a": { icon: CircleMinus, className: "text-muted-foreground" },
  not_checked: { icon: CircleMinus, className: "text-muted-foreground" },
};

/**
 * Whether Bader can reach each cadet and their parents: the cadet's own email
 * and phone, neither shared with a parent, and at least one parent contact,
 * each with an email and a phone. The cadet scraper reads it all off Bader;
 * the fix is made on Bader, so this page only lists who needs it.
 */
export default function ContactAuditPage() {
  const { data: session } = useSession();
  const { data, isLoading, error } = useApiQuery<unknown>(CONTACT_AUDIT_KEY, "/cadets/audit/contacts");
  const audit = contactAuditOrNull(data);
  const cadets = audit?.cadets ?? [];
  const counts = resultCounts(cadets);

  const [chosen, setChosen] = useState<ResultFilter | null>(null);
  // Open on what needs fixing, unless nothing does.
  const result: ResultFilter = chosen ?? (counts.bad ? "bad" : "all");
  const [flight, setFlight] = useState("");
  const [openCin, setOpenCin] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const shown = filterCadets(cadets, result, flight);

  async function exportXlsx() {
    setExporting(true);
    try {
      const res = await apiFetch(`${API_BASE}/cadets/audit/contacts/export`, {
        headers: { Authorization: `Bearer ${session?.id_token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(errorDetail(body) ?? "Couldn't export the contact audit.");
        return;
      }
      await saveResponseAsFile(res, "Contact audit.xlsx");
    } catch {
      toast.error("Couldn't export the contact audit.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Contact Audit"
        description="Each cadet's and their parents' contact details on Bader, read by the cadet scraper. Fix what's wrong on Bader."
        actions={
          <Button variant="outline" onClick={exportXlsx} disabled={exporting || !audit || !session?.id_token}>
            <Download /> {exporting ? "Exporting…" : "Export to Excel"}
          </Button>
        }
      />

      <ErrorAlert message={error?.message ?? null} title="Could not load the contact audit" />

      {isLoading && <OrderListSkeleton rows={6} />}

      {audit && cadets.length === 0 && (
        <EmptyState
          icon={BookUser}
          title="No cadets to check"
          description="Run the cadet scraper and every cadet on Bader is checked here."
        />
      )}

      {audit && cadets.length > 0 && (
        <>
          <StatGroup className="grid-cols-3">
            <Stat label="Need fixing" value={counts.bad} tone={counts.bad ? "destructive" : undefined} />
            <Stat label="All good" value={counts.good} tone="success" />
            <Stat label="Not checked yet" value={counts.not_checked} />
          </StatGroup>

          <div className="flex flex-wrap items-center gap-3">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              aria-label="Filter by result"
              value={result}
              // Radix sends "" when the pressed item is pressed again; keep it pressed.
              onValueChange={(v) => v && setChosen(v as ResultFilter)}
            >
              <ToggleGroupItem value="bad" className="px-3">
                Need fixing
              </ToggleGroupItem>
              <ToggleGroupItem value="not_checked" className="px-3">
                Not checked
              </ToggleGroupItem>
              <ToggleGroupItem value="good" className="px-3">
                Good
              </ToggleGroupItem>
              {/* Not "All": the flight filter beside it has one. */}
              <ToggleGroupItem value="all" className="px-3">
                Everyone
              </ToggleGroupItem>
            </ToggleGroup>
            <FlightFilter flights={flightsIn(cadets)} value={flight} onChange={setFlight} />
          </div>

          {shown.length === 0 ? (
            <EmptyState
              icon={CircleCheck}
              title="Nobody here"
              description="No cadet matches these filters."
            />
          ) : (
            <OrderList>
              {shown.map((c) => {
                const name = `${c.first_name} ${c.last_name}`;
                return (
                  <OrderDisclosure
                    key={c.cin}
                    open={openCin === c.cin}
                    onToggle={() => setOpenCin(openCin === c.cin ? null : c.cin)}
                    label={`contact details for ${name}`}
                    title={<CadetLink cin={c.cin}>{name}</CadetLink>}
                    meta={
                      [c.rank, c.flight && `${c.flight} Flight`].filter(Boolean).join(" · ") +
                      (c.problems.length
                        ? ` · ${c.problems.length} problem${c.problems.length === 1 ? "" : "s"}`
                        : "")
                    }
                    aside={
                      <Badge variant="outline" className={RESULT_BADGE[c.result]}>
                        {CHECK_LABELS[c.result]}
                      </Badge>
                    }
                  >
                    <CadetContactDetails cadet={c} checks={audit.checks} />
                  </OrderDisclosure>
                );
              })}
            </OrderList>
          )}
        </>
      )}
    </div>
  );
}

function Details({ emails, phones }: { emails: string[]; phones: string[] }) {
  return (
    <Private>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Email</dt>
        <dd className="min-w-0 break-words">{emails.join(", ") || "None"}</dd>
        <dt className="text-muted-foreground">Phone</dt>
        <dd>{phones.join(", ") || "None"}</dd>
      </dl>
    </Private>
  );
}

function CadetContactDetails({
  cadet,
  checks,
}: {
  cadet: ContactAuditCadet;
  checks: { key: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-5 text-sm">
      {cadet.problems.length > 0 && (
        <ul className="text-destructive flex list-disc flex-col gap-1 pl-5">
          {cadet.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2" aria-label="Checks">
        {checks.map(({ key, label }) => {
          const state = cadet.checks[key] ?? "not_checked";
          const { icon: Icon, className } = CHECK_ICON[state];
          return (
            <li key={key} className="flex items-center gap-2">
              <Icon className={cn("size-4 shrink-0", className)} aria-hidden />
              <span className="flex-1">{label}</span>
              <span className={cn("text-xs", className)}>{CHECK_LABELS[state]}</span>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">Cadet</h3>
        {cadet.checks.cadet_email === "not_checked" ? (
          <p className="text-muted-foreground">Not read from Bader yet.</p>
        ) : (
          <Details emails={cadet.emails} phones={cadet.phones} />
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-semibold">Parents and contacts</h3>
        {!cadet.contacts_checked_at ? (
          <p className="text-muted-foreground">Not read from Bader yet.</p>
        ) : cadet.contacts.length === 0 ? (
          <p className="text-muted-foreground">Nobody listed on Bader.</p>
        ) : (
          cadet.contacts.map((p, i) => (
            <div key={`${p.name}-${i}`} className="flex flex-col gap-1">
              <p className="font-medium">
                {p.name}
                <span className="text-muted-foreground font-normal">
                  {[p.relationship, p.next_of_kin && "next of kin"].filter(Boolean).map((t) => ` · ${t}`)}
                </span>
              </p>
              <Details emails={p.emails} phones={p.phones} />
            </div>
          ))
        )}
        {cadet.contacts_checked_at && (
          <p className="text-muted-foreground text-xs">
            Read from Bader {formatTimestamp(cadet.contacts_checked_at)}
          </p>
        )}
      </div>
    </div>
  );
}
