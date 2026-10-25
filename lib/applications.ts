import { apiRequest } from "@/lib/api-fetch";
import { API_BASE } from "@/lib/config";

/**
 * Staff cadet and adult staff applications: the Wing's step-by-step
 * checklists, ticked off on SMS as the applicant goes through them. The steps,
 * their wording and the print-off form links come from the API
 * (`core/appointments.py`), so the two can't disagree about what a step is.
 *
 * An application is complete once every step is ticked, or when staff mark it
 * complete by hand: one finished before SMS tracked it, or a waived step.
 */

export type Route = "snco" | "cfc";

export const ROUTE_LABEL: Record<Route, string> = { snco: "SNCO", cfc: "Officer (CFC)" };

export type StepLink = { label: string; url: string };
export type Step = { key: string; label: string; hint: string | null; links: StepLink[] };
export type Stage = {
  key: string;
  title: string;
  /** Routes the stage applies to; empty means every route. */
  routes: Route[];
  note: string | null;
  steps: Step[];
};

export type Tick = { at: string; by: string | null };

type ApplicationBase = {
  id: number;
  notes: string | null;
  steps: Record<string, Tick>;
  startedAt: string;
  startedBy: string | null;
  done: number;
  total: number;
  /** Every step ticked, or marked complete by hand. */
  complete: boolean;
  /** The first step not ticked, even when it's been marked complete. */
  nextStep: string | null;
  /** Who marked it complete by hand, whatever's ticked; null if nobody did. */
  markedComplete: Tick | null;
};

export type NearingCadet = {
  cin: number;
  name: string;
  rank: string | null;
  flight: string | null;
  dateOfBirth: string | null;
  turns18On: string | null;
  /** Negative once they've turned 18. */
  daysTo18: number | null;
};

export type StaffCadetApplication = ApplicationBase & { kind: "staff_cadet"; cadet: NearingCadet };

export type UniformedApplication = ApplicationBase & {
  kind: "uniformed";
  name: string;
  route: Route;
  /** 12 months after the JPA appointment step was ticked. */
  cicDueBy: string | null;
};

export type Application = StaffCadetApplication | UniformedApplication;

export type StaffCadetResponse = {
  stages: Stage[];
  applications: StaffCadetApplication[];
  nearing18: NearingCadet[];
};

export type UniformedResponse = { stages: Stage[]; applications: UniformedApplication[] };

export const STAFF_CADET_KEY = ["applications", "staff-cadets"] as const;
export const UNIFORMED_KEY = ["applications", "uniformed"] as const;

/** The stages this application goes through: an SNCO skips the Region board. */
export function stagesFor(stages: Stage[], route?: Route | null): Stage[] {
  return stages.filter((s) => !s.routes.length || (route != null && s.routes.includes(route)));
}

/** The label of the step to do next, for the collapsed row. */
export function nextStepLabel(stages: Stage[], key: string | null): string | null {
  if (!key) return null;
  for (const stage of stages) {
    const step = stage.steps.find((s) => s.key === key);
    if (step) return step.label;
  }
  return null;
}

/** How urgent the 18th birthday is: past it they're suspended until it's done. */
export function deadlineTone(daysTo18: number | null): "destructive" | "warning" | null {
  if (daysTo18 === null) return null;
  if (daysTo18 < 0) return "destructive";
  return daysTo18 <= 90 ? "warning" : null;
}

/** "Turns 18 in 3 months" / "in 12 days" / "Turned 18 2 weeks ago". */
export function deadlineText(daysTo18: number | null): string {
  if (daysTo18 === null) return "No date of birth on SMS";
  if (daysTo18 === 0) return "Turns 18 today";
  const days = Math.abs(daysTo18);
  const span =
    days < 14
      ? `${days} day${days === 1 ? "" : "s"}`
      : days < 61
        ? `${Math.round(days / 7)} weeks`
        : `${Math.round(days / 30.4)} months`;
  return daysTo18 > 0 ? `Turns 18 in ${span}` : `Turned 18 ${span} ago`;
}

// ── Writes ───────────────────────────────────────────────────────────────────

/** `complete` puts it straight on the Complete list: done before SMS tracked it. */
export function startStaffCadet(token: string, cin: number, complete = false) {
  return apiRequest<StaffCadetApplication>(
    token,
    `${API_BASE}/applications/staff-cadets`,
    { method: "POST", body: complete ? { cin, complete } : { cin } },
    complete ? "Couldn't mark it complete." : "Couldn't start the application."
  );
}

export function addUniformed(token: string, name: string, route: Route, complete = false) {
  return apiRequest<UniformedApplication>(
    token,
    `${API_BASE}/applications/uniformed`,
    { method: "POST", body: complete ? { name, route, complete } : { name, route } },
    "Couldn't add the applicant."
  );
}

export function tickStep<T extends Application>(token: string, id: number, key: string, done: boolean) {
  return apiRequest<T>(
    token,
    `${API_BASE}/applications/${id}/steps/${key}`,
    { method: "PUT", body: { done } },
    "Couldn't save that step."
  );
}

export function updateApplication<T extends Application>(
  token: string,
  id: number,
  body: { notes?: string; name?: string; route?: Route; complete?: boolean }
) {
  return apiRequest<T>(
    token,
    `${API_BASE}/applications/${id}`,
    { method: "PATCH", body },
    "Couldn't save the application."
  );
}

export async function removeApplication(token: string, id: number) {
  await apiRequest<null>(
    token,
    `${API_BASE}/applications/${id}`,
    { method: "DELETE" },
    "Couldn't remove the application."
  );
}
