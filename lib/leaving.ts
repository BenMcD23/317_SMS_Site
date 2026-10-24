/** Types and wording for the OC dashboard's leaving process. The eight-week and
 *  two-week rules live in the API (core/leaving.py); this only displays them. */

export type LeavingStatus = "flagged" | "waiting" | "start_leaving";

export type LeavingCadet = {
  cin: number;
  name: string;
  rank: string | null;
  flight: string | null;
  parentEmails: string[];
  lastAttended: string | null;
  gapDays: number | null;
  weeksAbsent: number | null;
  status: LeavingStatus;
  daysLeft: number | null;
  returned: boolean;
  notifiedAt: string | null;
  notifiedBy: string | null;
  adjRequestedAt: string | null;
};

export type LeavingResponse = {
  currentParadeNight: string | null;
  adjutantConfigured: boolean;
  cadets: LeavingCadet[];
};

export type ParentEmailsResponse = {
  /** "a@x;b@y" — ready to paste into a BCC, de-duplicated across cadets. */
  bcc: string;
  count: number;
  missing: number;
  cadets: { cin: number; name: string; flight: string | null; parentEmails: string[] }[];
};

export const STATUS_LABEL: Record<LeavingStatus, string> = {
  flagged: "Parents not contacted",
  waiting: "Notice running",
  start_leaving: "Ready to remove",
};

export type LeavingEmailTemplate = { subject: string; body: string };

/** The OC's saved wording; both null until they save their own. */
export type LeavingEmailResponse = { subject: string | null; body: string | null };

/** What the OC sends until they save their own. The site doesn't send it — it's
 *  sent from the OC's own account — so the two-week notice here has to match the
 *  clock the dashboard starts when they mark it sent. */
export const DEFAULT_LEAVING_EMAIL: LeavingEmailTemplate = {
  subject: "317 Squadron — is {{ cadet_name }} still with us?",
  body: [
    "Dear Parent/Guardian,",
    "",
    "{{ cadet_name }} hasn't been on parade for {{ weeks_absent }}, and we wanted to check in before doing anything else.",
    "",
    "If they would like to stay with 317 Squadron, they're very welcome back on the next parade night — there's nothing else you need to do.",
    "If they have decided to leave, or something is making it hard to attend, please reply to let us know.",
    "",
    "If we don't hear from you within two weeks, we will begin the process of removing them from the squadron.",
    "",
    "Kind regards,",
    "Officer Commanding, 317 (Failsworth) Squadron",
  ].join("\n"),
};

/** The placeholders the OC can put in the template, shown beside the editor. */
export const LEAVING_EMAIL_PLACEHOLDERS = [
  { token: "{{ cadet_name }}", hint: "the cadet's name" },
  { token: "{{ weeks_absent }}", hint: "how long they've been away, e.g. “around 9 weeks”" },
] as const;

/** Fill a template for one cadet. Unknown placeholders are left as typed so a
 *  typo is visible in the preview rather than silently vanishing. */
export function fillLeavingEmail(text: string, cadetName: string, weeksAbsent: number | null): string {
  const absent = weeksAbsent === null ? "some time" : `around ${weeksAbsent} weeks`;
  const values: Record<string, string> = { cadet_name: cadetName, weeks_absent: absent };
  // A replacer function, not a string, so a "$&" in a name isn't treated as a pattern.
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) => values[key] ?? whole);
}

/** The subject and body for one cadet, as a single block to paste. */
export function leaverQueryDraft(
  cadetName: string,
  weeksAbsent: number | null,
  template: LeavingEmailTemplate = DEFAULT_LEAVING_EMAIL
): string {
  const subject = fillLeavingEmail(template.subject, cadetName, weeksAbsent);
  const body = fillLeavingEmail(template.body, cadetName, weeksAbsent);
  return subject ? `Subject: ${subject}\n\n${body}` : body;
}

/** Cadets whose parents still need the query: flagged, not yet told, not back. */
export function cadetsToEmail(cadets: LeavingCadet[]): LeavingCadet[] {
  return cadets.filter((c) => c.status === "flagged" && !c.returned);
}

/** `a@x;b@y` for a BCC, de-duplicated across cadets (siblings share a parent). */
export function bccFor(cadets: LeavingCadet[]): string {
  const unique = new Map<string, string>();
  for (const c of cadets)
    for (const e of c.parentEmails) if (!unique.has(e.toLowerCase())) unique.set(e.toLowerCase(), e);
  return [...unique.values()].join(";");
}

/**
 * A link that opens Gmail's compose window, already addressed and written.
 * `authuser` picks the signed-in Google account, so it opens in the OC's own
 * mailbox rather than whichever one the browser had open last. Gmail ignores it
 * (and asks which account) if that address isn't signed in on the device.
 */
export function gmailComposeUrl(opts: {
  account?: string | null;
  bcc: string;
  subject: string;
  body: string;
}): string {
  // encodeURIComponent, not URLSearchParams: that writes spaces as "+", which
  // Gmail shows literally in the body. Gmail wants commas between recipients.
  const parts = [
    ["view", "cm"],
    ["fs", "1"],
    ["bcc", opts.bcc.replaceAll(";", ",")],
    ["su", opts.subject],
    ["body", opts.body],
  ];
  if (opts.account) parts.push(["authuser", opts.account]);
  return `https://mail.google.com/mail/?${parts.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}
