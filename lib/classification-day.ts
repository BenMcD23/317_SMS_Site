/**
 * Classification day planner — the shapes the API's /classification-day sends
 * and the grouping the page shows them in. Kept out of the page so the rules
 * for moving a cadet and copying the plan to a spreadsheet are tested on their
 * own.
 */

export type PlanKind = "exam" | "lesson" | "not_offered" | "first_class" | "complete";

export type AttendanceFlag = {
  code: "absence_booked" | "no_history" | "low_attendance" | "weekday" | "not_seen";
  message: string;
};

export type Attendance = {
  nights: number;
  present: number;
  weekday_nights: number;
  weekday_present: number;
  last_present: string | null;
  /** 0–1, their rate on this weekday (or overall); null with no history. */
  likelihood: number | null;
  flags: AttendanceFlag[];
};

export type PlannedCadet = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
  classification: string | null;
  kind: PlanKind;
  lesson_key: string | null;
  lesson_name: string | null;
  ready_exams: string[];
  /** A classification whose subjects are all passed but isn't on record yet. */
  awaiting: string | null;
  attendance: Attendance;
};

export type ClassificationPlan = { date: string; weekday: string; cadets: PlannedCadet[] };

export type Subject = { key: string; name: string; category: string };

/**
 * Where a cadet is put for the night. The API's suggestion becomes one of
 * these; staff can then move anyone, including to Float or off the list.
 */
export type Slot =
  | { kind: "exam" | "lesson"; key: string }
  | { kind: "float" | "none" | "not_offered" | "first_class" | "complete"; key?: undefined };

export function slotId(slot: Slot): string {
  return slot.key ? `${slot.kind}:${slot.key}` : slot.kind;
}

export function parseSlotId(id: string): Slot {
  const [kind, key] = id.split(":");
  if (kind === "exam" || kind === "lesson") return key ? { kind, key } : { kind: "none" };
  return { kind: kind as Exclude<Slot["kind"], "exam" | "lesson"> };
}

/** The API's suggestion as a slot. Not-offered cadets aren't put on a lesson
 *  the squadron isn't running — they wait in their own group to be moved. */
export function suggestedSlot(cadet: PlannedCadet): Slot {
  if (cadet.kind === "exam" || cadet.kind === "lesson") {
    return cadet.lesson_key ? { kind: cadet.kind, key: cadet.lesson_key } : { kind: "none" };
  }
  return { kind: cadet.kind };
}

export type PlanGroup = {
  id: string;
  title: string;
  /** One line under the title saying what the group means. */
  hint?: string;
  cadets: { cadet: PlannedCadet; slot: Slot }[];
};

const TAIL_GROUPS: { kind: Slot["kind"]; title: string; hint: string }[] = [
  { kind: "float", title: "Float", hint: "Spare hands for the night" },
  {
    kind: "not_offered",
    title: "Next subject not running",
    hint: "Their next subject isn't one of tonight's lessons — move them onto one",
  },
  {
    kind: "first_class",
    title: "Working towards First Class",
    hint: "Not on the classification subjects yet",
  },
  { kind: "complete", title: "All subjects passed", hint: "Nothing left to teach or examine" },
  { kind: "none", title: "Not on tonight's list", hint: "Taken off by you" },
];

/**
 * The night's groups in the order they're run: exams, each lesson in syllabus
 * order, then everyone not on a lesson. Empty groups are left out.
 */
export function buildGroups(
  cadets: PlannedCadet[],
  subjects: Subject[],
  overrides: Record<number, Slot>
): PlanGroup[] {
  const placed = cadets.map((cadet) => ({ cadet, slot: overrides[cadet.cin] ?? suggestedSlot(cadet) }));
  const order = new Map(subjects.map((s, i) => [s.key, i]));
  const byOrder = (key: string) => order.get(key) ?? subjects.length;

  const exams = placed
    .filter((p) => p.slot.kind === "exam")
    .sort((a, b) => byOrder(a.slot.key!) - byOrder(b.slot.key!));
  const groups: PlanGroup[] = [];
  if (exams.length) {
    groups.push({ id: "exam", title: "Exams", hint: "Had the lesson, not sat the exam yet", cadets: exams });
  }
  for (const subject of subjects) {
    const on = placed.filter((p) => p.slot.kind === "lesson" && p.slot.key === subject.key);
    if (on.length) groups.push({ id: `lesson:${subject.key}`, title: subject.name, cadets: on });
  }
  for (const tail of TAIL_GROUPS) {
    const on = placed.filter((p) => p.slot.kind === tail.kind);
    if (on.length) groups.push({ id: tail.kind, title: tail.title, hint: tail.hint, cadets: on });
  }
  return groups;
}

/** What the cadet is doing, for the exam list and the spreadsheet copy. */
export function slotLabel(slot: Slot, subjects: Subject[]): string {
  const name = (key: string) => subjects.find((s) => s.key === key)?.name ?? key;
  if (slot.kind === "exam") return `${name(slot.key)} exam`;
  if (slot.kind === "lesson") return name(slot.key);
  return TAIL_GROUPS.find((t) => t.kind === slot.kind)?.title ?? slot.kind;
}

/**
 * The plan as tab-separated text, which pastes into Google Sheets as cells —
 * the squadron's classification day sheet is kept there. One block per group:
 * its title, then one row per cadet with what they're doing and any flags.
 */
export function planToTsv(groups: PlanGroup[], subjects: Subject[]): string {
  const clean = (text: string) => text.replace(/[\t\n]+/g, " ");
  return groups
    .filter((g) => g.id !== "none")
    .map((g) =>
      [
        g.title,
        ...g.cadets.map(({ cadet, slot }) =>
          [
            `${cadet.last_name}, ${cadet.first_name}`,
            slotLabel(slot, subjects),
            cadet.attendance.flags.map((f) => f.message).join("; "),
          ]
            .map(clean)
            .join("\t")
        ),
      ].join("\n")
    )
    .join("\n\n");
}

/** Cadets carrying at least one attendance flag. */
export function countFlagged(cadets: PlannedCadet[]): number {
  return cadets.filter((c) => c.attendance.flags.length > 0).length;
}
