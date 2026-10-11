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

/** What the OC pastes under the BCC. The site doesn't send it — it's sent from
 *  the OC's own account — so the two-week notice here has to match the clock
 *  the dashboard starts when they mark it sent. */
export function leaverQueryDraft(cadetName: string, weeksAbsent: number | null): string {
  const absent = weeksAbsent === null ? "some time" : `around ${weeksAbsent} weeks`;
  return [
    "Subject: 317 Squadron — is " + cadetName + " still with us?",
    "",
    "Dear Parent/Guardian,",
    "",
    `${cadetName} hasn't been on parade for ${absent}, and we wanted to check in before doing anything else.`,
    "",
    "If they would like to stay with 317 Squadron, they're very welcome back on the next parade night — there's nothing else you need to do.",
    "If they have decided to leave, or something is making it hard to attend, please reply to let us know.",
    "",
    "If we don't hear from you within two weeks, we will begin the process of removing them from the squadron.",
    "",
    "Kind regards,",
    "Officer Commanding, 317 (Failsworth) Squadron",
  ].join("\n");
}
