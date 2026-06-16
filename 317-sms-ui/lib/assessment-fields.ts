// Shared assessment field definitions, limits and pass/fail rules.
//
// These mirror the per-type create forms (app/assessments/*) and the backend
// PDF builders so the inline editor stays consistent with both.

export type ScoreMap = Record<number, number | null>;

// ─── Leadership ─────────────────────────────────────────────────────────────

export const DEBRIEF_MAX = 540;

export const LEADERSHIP_QUESTIONS = [
  { id: 1, text: 'Did the team leader follow "SMEAC" as a briefing tool?', labels: { 1: "No", 3: "Almost", 5: "Yes" } },
  { id: 2, text: "Were ALL the limitations mentioned?", labels: { 1: "No", 3: "Some", 5: "All" } },
  { id: 3, text: "Was the time limitation mentioned then monitored?", labels: { 1: "No", 3: "Sometimes", 5: "Yes" } },
  { id: 4, text: "Was there an initial plan?", labels: { 1: "No", 3: "Almost", 5: "Yes" } },
  { id: 5, text: "Did the team leader re-evaluate when things went wrong?", labels: { 1: "No", 3: "Indecisive", 5: "Yes" } },
  { id: 6, text: "Did the rest of the team know what was meant to be happening?", labels: { 1: "Never", 3: "Sometimes", 5: "Always" } },
  { id: 7, text: "Were limitations monitored?", labels: { 1: "Never", 3: "Sometimes", 5: "Always" } },
  { id: 8, text: "Was the leader confident?", labels: { 1: "Never", 3: "Sometimes", 5: "Always" } },
  { id: 9, text: "If you had just entered the room, would you be able to tell who was in charge?", labels: { 1: "Unlikely", 3: "Maybe", 5: "Always" } },
  { id: 10, text: "Was praise/encouragement given when necessary?", labels: { 1: "No", 3: "Sometimes", 5: "Yes" } },
] as const;

export function leadershipPassed(scores: ScoreMap): boolean {
  const vals = Object.values(scores).filter((v): v is number => v !== null);
  const total = vals.reduce((a, b) => a + b, 0);
  return vals.length === LEADERSHIP_QUESTIONS.length && total >= 30 && !vals.some((v) => v === 1);
}

// ─── Radio ──────────────────────────────────────────────────────────────────

export const RADIO_COMMENTS_MAX = 140;

export const RADIO_CRITERIA = [
  { id: "callsigns", label: "Correct Use of Both Full Callsigns" },
  { id: "auth_1a", label: "1a) Authenticate Requested" },
  { id: "auth_1b", label: "1b) Authenticate Answered Correctly" },
  { id: "radio_2a", label: "2a) Radio Check Requested" },
  { id: "radio_2b", label: "2b) Radio Check Answered Correctly" },
  { id: "tactical_3", label: "3) Tactical Message Fully Answered" },
  { id: "say_again_4", label: "4) I Say Again used" },
  { id: "say_again_5", label: "5) Say Again used" },
  { id: "prowords", label: "Prowords OVER, OUT etc. used correctly. General quick responses, RSVP and confidence." },
  { id: "verbal_understanding", label: "Verbally check understanding of CORRECT, CORRECTION, I SPELL, NOTHING HEARD, FIGURES, ROGER, WAIT OUT, SPEAK SLOWER." },
  { id: "verbal_security", label: "Verbally check understanding of security – must not transmit names, ranks, locations, movement of arms and ammunition, personal or Sqn details, movements, current aircraft etc." },
] as const;

export function radioPassed(criteria: Record<string, boolean>): boolean {
  return RADIO_CRITERIA.every((c) => criteria[c.id]);
}

// ─── MOI ────────────────────────────────────────────────────────────────────

export const MOI_SECTIONS = [
  {
    id: "identifying",
    title: "Identifying Participants Needs",
    commentLimit: 670,
    questions: [
      { id: 1, text: "Have participants needs been identified?" },
      { id: 2, text: "Are objectives SMART?" },
    ],
  },
  {
    id: "planning",
    title: "Planning and Preparation of Lesson",
    commentLimit: 900,
    questions: [
      { id: 3, text: "Was lesson plan submitted and complete?" },
      { id: 4, text: "Were resources prepared and ready?" },
      { id: 5, text: "Was delivery of lesson properly structured?" },
    ],
  },
  {
    id: "resources",
    title: "Use of Resources",
    commentLimit: 900,
    questions: [
      { id: 6, text: "Were resources used effectively?" },
      { id: 7, text: "How well did resources support delivery of lesson?" },
    ],
  },
  {
    id: "delivery",
    title: "Delivery of Lesson",
    commentLimit: 500,
    questions: [
      { id: 8, text: "Was the delivery of the session confident and clear?" },
      { id: 9, text: "How well did the candidate manage the classroom environment?" },
    ],
  },
  {
    id: "assessment",
    title: "Assessment of Students",
    commentLimit: 900,
    questions: [
      { id: 10, text: "How well was the student's learning assessed throughout the session?" },
      { id: 11, text: "How well did the assessment at the end of the session achieve initial objectives?" },
    ],
  },
  {
    id: "evaluation",
    title: "Evaluation of Lesson",
    commentLimit: 900,
    questions: [
      { id: 12, text: "During the session, did the instructor actively adapt to any changes in the lesson plan?" },
      { id: 13, text: "During debrief, was the instructor able to evaluate their lesson?" },
    ],
  },
] as const;

export const MOI_ALL_QUESTIONS: { id: number; text: string }[] = MOI_SECTIONS.flatMap((s) =>
  s.questions.map((q) => ({ id: q.id, text: q.text }))
);
export const MOI_PASS_SCORE = 35;
export const MOI_SUMMARY_MAX = 1150;
export const MOI_MAX_SCORE = MOI_ALL_QUESTIONS.length * 5;

export function moiPassed(scores: ScoreMap): boolean {
  const vals = Object.values(scores).filter((v): v is number => v !== null);
  const total = vals.reduce((a, b) => a + b, 0);
  return vals.length === MOI_ALL_QUESTIONS.length && total >= MOI_PASS_SCORE && !vals.some((v) => v === 1);
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

// Normalise a stored scores object ({"1": 4, ...}) into a number-keyed map,
// ensuring every expected question id is present (null if unanswered).
export function normaliseScores(
  raw: Record<string, number | null> | undefined,
  ids: readonly number[]
): ScoreMap {
  const out: ScoreMap = {};
  for (const id of ids) {
    const v = raw?.[String(id)] ?? raw?.[id as unknown as string];
    out[id] = typeof v === "number" ? v : null;
  }
  return out;
}

// Derive a YYYY-MM-DD value for a date <input> from stored fields.
// Prefers the raw ISO date; falls back to parsing a DD/MM/YY display string.
export function isoDateForInput(dateIso?: string, display?: string): string {
  if (dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return dateIso;
  if (display) {
    const m = display.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
    if (m) {
      const [, dd, mm, yy] = m;
      return `20${yy}-${mm}-${dd}`;
    }
  }
  return "";
}
