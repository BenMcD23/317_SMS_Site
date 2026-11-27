/**
 * The contact details audit (`GET /cadets/audit/contacts`): Bader's contact
 * details for each cadet and their parents, checked by the API
 * (`core/contact_audit.py` there). The rules live in the API so the page and
 * the Excel export can't disagree; this module only types and groups them.
 */

export type CheckState = "good" | "bad" | "n/a" | "not_checked";

export type ContactAuditContact = {
  name: string;
  title: string | null;
  relationship: string | null;
  next_of_kin: boolean;
  emails: string[];
  phones: string[];
};

export type ContactAuditCadet = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
  emails: string[];
  phones: string[];
  contacts: ContactAuditContact[];
  checks: Record<string, CheckState>;
  result: Exclude<CheckState, "n/a">;
  problems: string[];
  contacts_checked_at: string | null;
};

export type ContactAuditResponse = {
  checks: { key: string; label: string }[];
  cadets: ContactAuditCadet[];
};

export const CONTACT_AUDIT_KEY = ["cadets", "audit", "contacts"] as const;

export const CHECK_LABELS: Record<CheckState, string> = {
  good: "Good",
  bad: "Bad",
  "n/a": "N/A",
  not_checked: "Not checked",
};

/** Which results the list shows. "bad" first: it's the list someone works through. */
export type ResultFilter = "bad" | "not_checked" | "good" | "all";

/** The response, or null when the body isn't one (an error `{detail}` that slipped through). */
export function contactAuditOrNull(data: unknown): ContactAuditResponse | null {
  const d = data as ContactAuditResponse | null | undefined;
  return d && Array.isArray(d.cadets) && Array.isArray(d.checks) ? d : null;
}

export function resultCounts(cadets: ContactAuditCadet[]): Record<ContactAuditCadet["result"], number> {
  const counts = { good: 0, bad: 0, not_checked: 0 };
  for (const c of cadets) counts[c.result] += 1;
  return counts;
}

export function filterCadets(
  cadets: ContactAuditCadet[],
  result: ResultFilter,
  flight: string
): ContactAuditCadet[] {
  return cadets.filter((c) => (result === "all" || c.result === result) && (!flight || c.flight === flight));
}
