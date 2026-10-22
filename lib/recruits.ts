import { API_BASE } from "@/lib/config";
import { apiRequest } from "@/lib/api-fetch";

/**
 * New recruits' joining forms (RAFAC 3822A + 3822H). Parents fill them in from
 * a link on the squadron website; these are the API's shapes and the write
 * calls the Recruits pages share. The option labels come from the API with the
 * form, so the wording parents see and staff read is the same.
 */

export type RecruitStatus = "not_started" | "opened" | "in_progress" | "submitted";

export type Step = { key: string; label: string; done: boolean };

export type Recruit = {
  id: number;
  cadetFirstName: string;
  cadetLastName: string;
  parentName: string;
  parentEmail: string;
  status: RecruitStatus;
  progress: { done: number; total: number; steps: Step[] };
  link: string;
  expiresAt: string;
  expired: boolean;
  createdAt: string;
  createdBy: string | null;
  openedAt: string | null;
  lastSavedAt: string | null;
  submittedAt: string | null;
};

export type Option = { key: string; label: string; group?: string };

export type RecruitOptions = {
  ethnicities: Option[];
  conditions: Option[];
  allergies: Option[];
  diets: Option[];
  accommodation: Option[];
  organisations: Option[];
  consents: Option[];
  steps: Option[];
  cadetSignsFromAge: number;
};

type Address = {
  property: string;
  street: string;
  area: string;
  town: string;
  county: string;
  country: string;
  postcode: string;
  mobile: string;
  homePhone: string;
  email: string;
  email2: string;
};
export type Person = Address & { title: string; fullName: string; relationship: string };
export type Severity = "mild" | "moderate" | "severe";

export type RecruitFormData = {
  cadet: {
    fullName: string;
    dob: string | null;
    religion: string;
    gender: "male" | "female" | "pnts" | "other" | null;
    genderOther: string;
    pronoun: "he" | "she" | "they" | null;
    ethnicity: string | null;
    externalAgency: boolean | null;
  };
  contact: Address;
  // Yes/no per organisation key (from options.organisations), plus free text.
  history: { other: string } & { [key: string]: boolean | null | string };
  nok: Person & { hasParentalResponsibility: boolean | null };
  extra: Person;
  // Yes/no per consent key (from options.consents), plus the accommodation types.
  consent: { accommodationTypes: string[] } & { [key: string]: boolean | null | string[] };
  medical: {
    has: boolean | null;
    conditions: string[];
    ehcPlan: boolean | null;
    ehcCopy: boolean | null;
    details: {
      /** The ticked condition this describes; null when the parent added it by hand. */
      condition: string | null;
      name: string;
      severity: Severity | null;
      soughtAdvice: boolean | null;
      routine: string;
      strenuous: string;
      control: string;
      medication: string;
      dosage: string;
      storage: string;
    }[];
    allergies: Record<string, { autoInjector: boolean; severity: Severity | null }>;
    allergyOther: string;
    diet: string[];
    dietOther: string;
  };
  about: { school: string; heardFrom: string; reason: string };
  signer: { forename: string; surname: string };
};

export type RecruitDetail = Recruit & {
  data: RecruitFormData;
  missing: Record<string, string[]>;
  options: RecruitOptions;
  parentSignature: string | null;
  cadetSignature: string | null;
  hasHealthDeclaration: boolean;
};

export type NewRecruit = Pick<Recruit, "cadetFirstName" | "cadetLastName" | "parentName" | "parentEmail">;

export type PdfForm = "both" | "3822A" | "3822H";

export function recruitName(r: Pick<Recruit, "cadetFirstName" | "cadetLastName">): string {
  return `${r.cadetFirstName} ${r.cadetLastName}`.trim();
}

/** Where a recruit is up to, in the words the list shows. An expired link
 *  outranks progress: until it's extended nothing more can happen. */
export function statusLabel(r: Pick<Recruit, "status" | "expired">): string {
  if (r.status === "submitted") return "Submitted";
  if (r.expired) return "Link expired";
  return { not_started: "Not opened", opened: "Opened", in_progress: "In progress" }[r.status];
}

/** The badge tone for a status: done, needs a nudge, or just waiting. */
export function statusTone(r: Pick<Recruit, "status" | "expired">): "success" | "warning" | "muted" {
  if (r.status === "submitted") return "success";
  if (r.expired) return "warning";
  return "muted";
}

/** Whole days until the link expires (0 on its last day, negative once gone). */
export function daysLeft(expiresAt: string, now: Date = new Date()): number {
  return Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 86_400_000);
}

export function addRecruit(token: string, body: NewRecruit) {
  return apiRequest<Recruit>(token, `${API_BASE}/recruits`, { method: "POST", body }, "Couldn't add the recruit.");
}

export function extendRecruitLink(token: string, id: number) {
  return apiRequest<Recruit>(
    token,
    `${API_BASE}/recruits/${id}/extend`,
    { method: "POST" },
    "Couldn't extend the link."
  );
}

/** Send a submitted form back to the parent to correct: answers kept, signatures cleared, link live for 14 days. */
export function reopenRecruit(token: string, id: number) {
  return apiRequest<Recruit>(
    token,
    `${API_BASE}/recruits/${id}/reopen`,
    { method: "POST" },
    "Couldn't reopen the form."
  );
}

export async function deleteRecruit(token: string, id: number) {
  // 204: no body, so apiRequest's JSON parse just yields null.
  await apiRequest<null>(token, `${API_BASE}/recruits/${id}`, { method: "DELETE" }, "Couldn't delete the recruit.");
}

export function recruitPdfPath(id: number, form: PdfForm): string {
  return `${API_BASE}/recruits/${id}/pdf?form=${form}`;
}
