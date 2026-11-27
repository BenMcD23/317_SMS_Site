// Parade-night attendance reports: the shapes the API sends and the writes
// the settings page makes. Shared by the list, the report and the settings
// pages so the three agree on one set of types and one set of API calls.

import { apiRequest } from "@/lib/api-fetch";
import type { AttendanceState, StateCounts } from "@/lib/attendance";

export type ParadeReportSummary = {
  date: string; // "YYYY-MM-DD"
  generatedAt: string;
  generatedBy: string; // "schedule" or the staff member who built it
  emailedAt: string | null;
  counts: StateCounts;
};

export type ParadeReportList = {
  canManage: boolean; // staff; SNCOs and NCOs on the list only read
  onList: boolean; // false: an SNCO or NCO staff haven't added, so no reports
  reports: ParadeReportSummary[];
};

export type ParadeReportCadet = {
  cin: number;
  name: string;
  rank: string | null;
  flight: string | null;
  status: string | null; // Bader's wording
  state: AttendanceState;
};

export type ParadeReport = ParadeReportSummary & {
  emailedTo: string[] | null; // null for readers who aren't staff
  cadets: ParadeReportCadet[];
};

export type ReportPerson = { email: string; name: string | null; role: string | null };

export type ParadeReportSettings = {
  enabled: boolean;
  runsAs: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  schedule: { days: string[]; hour: number; minute: number };
  recipients: ReportPerson[];
  candidates: ReportPerson[];
};

/** Report sections in the order they're read: the people to follow up first. */
export const REPORT_SECTIONS: { state: AttendanceState; title: string }[] = [
  { state: "absent", title: "Absent" },
  { state: "authorised", title: "Authorised absence" },
  { state: "present", title: "Present" },
];

const DAY_NAMES: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/** "21:30 on Wednesday and Friday", from the schedule the API runs on. */
export function scheduleText(schedule: ParadeReportSettings["schedule"]): string {
  const time = `${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
  const days = schedule.days.map((d) => DAY_NAMES[d] ?? d);
  const list = days.length > 1 ? `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}` : days[0];
  return list ? `${time} on ${list}` : time;
}

/** "Wednesday 25 Nov 2026" from "2026-11-25", read as a local date so it
 *  never slips a day either side of midnight UTC. */
export function nightTitle(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const night = new Date(y, m - 1, d);
  // Two calls rather than one: en-GB puts a comma after the weekday.
  const weekday = night.toLocaleDateString("en-GB", { weekday: "long" });
  return `${weekday} ${night.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

/** A person's name for the list, falling back to their email. */
export function personLabel(p: ReportPerson): string {
  return p.name || p.email;
}

export const ROLE_LABEL: Record<string, string> = { staff: "Staff", snco: "SNCO", nco: "NCO" };

export function setReportsEnabled(token: string, enabled: boolean) {
  return apiRequest<ParadeReportSettings>(
    token,
    "/api/parade-reports/settings",
    { method: "PUT", body: { enabled } },
    "Couldn't change the report."
  );
}

export function addRecipient(token: string, email: string) {
  return apiRequest<ParadeReportSettings>(
    token,
    "/api/parade-reports/recipients",
    { method: "POST", body: { email } },
    "Couldn't add them."
  );
}

export function removeRecipient(token: string, email: string) {
  return apiRequest<ParadeReportSettings>(
    token,
    `/api/parade-reports/recipients/${encodeURIComponent(email)}`,
    { method: "DELETE" },
    "Couldn't remove them."
  );
}

export function buildReport(token: string, date: string, email: boolean) {
  return apiRequest<ParadeReport>(
    token,
    "/api/parade-reports",
    { method: "POST", body: { date, email } },
    "Couldn't build the report."
  );
}
