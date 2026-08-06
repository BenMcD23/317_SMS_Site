// Shared types + write calls for NCO holidays.
//
// A holiday is booked here and mirrored onto the squadron's shared "NCO
// Holidays" Google Calendar. Cancelling one pulls the calendar event but keeps
// the record — the list is the audit trail, so cancelled bookings stay visible
// alongside who added them, when, and who removed them.

"use client";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

export interface NcoHoliday {
  id: number;
  date_from: string;
  date_to: string;
  reason: string;
  booked_by_name: string;
  booked_by_email: string;
  created_at: string | null;
  cancelled: boolean;
  cancelled_at: string | null;
  cancelled_by_name: string | null;
  is_mine: boolean;
  can_cancel: boolean;
  /** False when the booking saved but never reached Google Calendar. */
  on_calendar: boolean;
}

export interface NcoHolidayList {
  holidays: NcoHoliday[];
  is_staff: boolean;
  /** False when NCO_HOLIDAY_CALENDAR_ID isn't set on the API. */
  calendar_configured: boolean;
  /** Notice this viewer has to give before the first day off. 0 for staff. */
  min_notice_days: number;
  /** "YYYY-MM-DD" the viewer can book from, or null when they're exempt. */
  earliest_booking_date: string | null;
}

export interface NewHoliday {
  date_from: string;
  date_to: string;
  reason: string;
}

/**
 * True when the calendar disagrees with the record: a live holiday that never
 * reached Calendar, or a cancelled one whose event is still sitting there. Both
 * are fixed by the same retry.
 */
export function needsSync(h: NcoHoliday): boolean {
  return h.cancelled ? h.on_calendar : !h.on_calendar;
}

/** Whole days, inclusive at both ends — matches how the API counts the range. */
export function holidayDays(h: { date_from: string; date_to: string }): number {
  const from = new Date(h.date_from);
  const to = new Date(h.date_to);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

async function request<T>(
  token: string,
  path: string,
  init: { method: string; body?: unknown } = { method: "POST" },
): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(`${API_BASE}/nco-holidays${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new Error("Server unreachable.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.detail ?? "Something went wrong.");
  return data as T;
}

/** Book a holiday for yourself — the API won't let you book anyone else's. */
export function bookHoliday(token: string, body: NewHoliday): Promise<NcoHoliday> {
  return request<NcoHoliday>(token, "", { method: "POST", body });
}

/** Remove from the calendar; the record stays, stamped with who cancelled it. */
export function cancelHoliday(token: string, id: number): Promise<NcoHoliday> {
  return request<NcoHoliday>(token, `/${id}/cancel`, { method: "POST" });
}

/** Retry the calendar push for a booking that saved while Calendar was down. */
export function syncHoliday(token: string, id: number): Promise<NcoHoliday> {
  return request<NcoHoliday>(token, `/${id}/sync`, { method: "POST" });
}
