/**
 * The API's verdict on whether a cadet's SMS record actually evidences a badge
 * being ordered (`GET /cadets/{cin}/badge-qual-check`, keyed by the same badge
 * names `buildBadgeName` produces; also attached to every badge order item as
 * `qualStatus`).
 *
 * The verdict is recomputed by the API on every read rather than stored on the
 * order, so an item flagged tonight stops being flagged once the qualification
 * lands on SMS. The wording comes from the API too, so this site and the cadet
 * portal can't describe the same finding differently — this file only decides
 * how it looks.
 */

export type BadgeQualStatus = {
  /** held = on SMS and current · expired = lapsed · missing = nothing on record ·
   *  unknown = not tied to a qualification we can check (core badges) */
  status: "held" | "expired" | "missing" | "unknown";
  /** A ready-to-show sentence, e.g. "SMS shows Blue Leadership, awarded 30 Mar 2022." */
  reason: string;
  qualName: string | null;
  dateAchieved: string | null;
  dateExpires: string | null;
  levelHeld: string | null;
  highestHeld: string | null;
};

export type BadgeQualChecks = Record<string, BadgeQualStatus>;

/**
 * Whether SMS positively fails to back this badge up.
 *
 * Only a definite "no" counts. A check that hasn't loaded, or a badge that
 * isn't tied to a qualification, is "couldn't check" rather than "no", and
 * must never be shown as a problem with the order.
 */
export function isQualUnevidenced(check: BadgeQualStatus | undefined): boolean {
  return check?.status === "missing" || check?.status === "expired";
}

/** Short label for the status chip. */
export function qualStatusLabel(status: BadgeQualStatus["status"]): string {
  if (status === "held") return "On SMS";
  if (status === "expired") return "Qualification expired";
  return "Not on SMS";
}
