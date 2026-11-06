"use client";

import { apiRequest } from "@/lib/api-fetch";
import { API_BASE, PORTAL_URL } from "@/lib/config";

/**
 * Types and write calls for checking cadets in on the night (the API's
 * routers/check_ins.py). Shared by the door list and the code dialog so the
 * portal link is built in one place. A check-in is a head count for the
 * session planner, never the Bader register.
 */

export interface DoorCadet {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
  checked_in: boolean;
  /** UK local time, as the API stores it: "2026-11-09T19:05:00". */
  checked_in_at: string | null;
  /** The NCO or staff member who ticked them in; null when they used the code. */
  checked_in_by: string | null;
}

export interface DoorList {
  date: string;
  today: boolean;
  checked_in: number;
  cadets: DoorCadet[];
}

export interface CheckInCode {
  code: string;
  changed_at: string;
  changed_by: string | null;
}

/** What the door's QR code and NFC tag open, or null with no portal address
 *  set: a code printed pointing nowhere would turn every cadet away. */
export function checkInUrl(code: string, portal: string = PORTAL_URL): string | null {
  if (!portal) return null;
  return `${portal.replace(/\/+$/, "")}/check-in/${encodeURIComponent(code)}`;
}

/** How they got in: "with their phone" (QR code or NFC tag), else who ticked them. */
export function checkedInHow(c: Pick<DoorCadet, "checked_in_by">): string {
  return c.checked_in_by ? `by ${c.checked_in_by}` : "with their phone";
}

export function checkIn(token: string, cin: number): Promise<DoorCadet & { already: boolean }> {
  return apiRequest(
    token,
    `${API_BASE}/check-ins`,
    { method: "POST", body: { cin } },
    "Couldn't check them in."
  );
}

export async function undoCheckIn(token: string, cin: number): Promise<void> {
  await apiRequest(token, `${API_BASE}/check-ins/${cin}`, { method: "DELETE" }, "Couldn't take it off.");
}

export function newCheckInCode(token: string): Promise<CheckInCode> {
  return apiRequest(token, `${API_BASE}/check-ins/code`, { method: "POST" }, "Couldn't make a new code.");
}
