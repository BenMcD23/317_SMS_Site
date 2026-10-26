"use client";

import { useApiQuery } from "@/lib/use-api-query";

/** One adult on the Staff table, as `/api/staff/users` returns them. */
export type StaffMember = {
  cin: number;
  email: string | null;
  phoneNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  rank: string | null;
  address: string | null;
  attendance: Record<string, number> | null; // { "YYYY-MM": count }
  userId: number | null;
};

/**
 * The staff list, cached under one key. Shared by the staff list and a staff
 * member's page, so opening someone from the list shows them straight away
 * instead of fetching the whole list again.
 */
export function useStaffUsers() {
  return useApiQuery<StaffMember[]>(["staff", "users"], "/api/staff/users");
}
