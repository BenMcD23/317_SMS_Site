/**
 * Staff DBS, BPSS and mandatory training from the Volunteer Portal sync: the
 * API's GET /staff/compliance (routers/staff_compliance.py) and the words the
 * page and the OC dashboard both use for it.
 */

export type ComplianceStatus = "ok" | "expiring" | "expired" | "missing";
export type ComplianceItem = {
  key: string;
  name: string;
  kind: "vetting" | "training";
  achieved: string | null;
  expires: string | null;
  status: ComplianceStatus;
};
export type StaffCompliance = {
  cin: number;
  name: string;
  rank: string | null;
  /** null: the portal sync has never brought anything back for them. */
  items: ComplianceItem[] | null;
  status: ComplianceStatus | null;
  synced_at: string | null;
};
export type ComplianceResponse = { everyone: boolean; due_within_days: number; staff: StaffCompliance[] };

export const COMPLIANCE_KEY = ["staff", "compliance"] as const;

export const COMPLIANCE_LABEL: Record<ComplianceStatus, string> = {
  expired: "Lapsed",
  missing: "Not done",
  expiring: "Due soon",
  ok: "Up to date",
};

/** Worst first, matching core/staff_compliance.SEVERITY in the API. */
const SEVERITY: ComplianceStatus[] = ["expired", "missing", "expiring", "ok"];

/** The items to chase, worst first then soonest, as the weekly email lists them. */
export function itemsToChase(items: ComplianceItem[] | null): ComplianceItem[] {
  return (items ?? [])
    .filter((i) => i.status !== "ok")
    .sort(
      (a, b) =>
        SEVERITY.indexOf(a.status) - SEVERITY.indexOf(b.status) ||
        (a.expires ?? "9999").localeCompare(b.expires ?? "9999") ||
        a.name.localeCompare(b.name)
    );
}

/** People ordered worst first, never-synced after everyone else, then by name. */
export function byUrgency(staff: StaffCompliance[]): StaffCompliance[] {
  const rank = (s: StaffCompliance) => (s.status ? SEVERITY.indexOf(s.status) : SEVERITY.length);
  return [...staff].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** Headline counts: people by their worst status, and how many have never been synced. */
export function complianceCounts(staff: StaffCompliance[]) {
  const count = (status: ComplianceStatus) => staff.filter((s) => s.status === status).length;
  return {
    expired: count("expired"),
    missing: count("missing"),
    expiring: count("expiring"),
    ok: count("ok"),
    unsynced: staff.filter((s) => s.status === null).length,
  };
}
