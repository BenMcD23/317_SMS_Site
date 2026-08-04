// Shared types + field metadata for NCO session plans.
//
// The field lists below are the single description of the squadron's paper
// session plan: the new/edit form renders them, the detail page reads them back,
// and the staff review panel hangs a feedback box off each section. Adding a
// field means touching this file, not three pages.

export type SessionPlanStatus =
  | "draft"
  | "submitted"
  | "amendments_requested"
  | "approved";

/** Keys of the five-part section plan — must match SESSION_PLAN_SECTIONS in the API. */
export type SessionPlanSectionKey =
  | "situation"
  | "mission"
  | "execution"
  | "any_questions"
  | "check_understanding";

export interface TimetableRow {
  timing: string;
  event: string;
  location: string;
}

export interface SessionPlanAttachment {
  id: number;
  filename: string;
  mime_type: string;
  uploaded_at: string | null;
}

export interface SessionPlanSummary {
  id: number;
  session_name: string;
  session_ic: string;
  session_date: string | null;
  status: SessionPlanStatus;
  author_name: string;
  author_email: string;
  created_at: string | null;
  updated_at: string | null;
  submitted_at: string | null;
}

export interface SessionPlanDetail extends SessionPlanSummary {
  aim: string;
  participants: string;
  rooming: string;
  equipment: string;
  situation: string;
  mission: string;
  execution: string;
  any_questions: string;
  check_understanding: string;
  timetable: TimetableRow[];
  notes: string;
  feedback: Partial<Record<SessionPlanSectionKey, string>>;
  amendment_note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  attachments: SessionPlanAttachment[];
  is_author: boolean;
  can_review: boolean;
  can_edit: boolean;
}

/** Everything the NCO fills in — the shape both the form and the API expect. */
export interface SessionPlanContent {
  session_name: string;
  session_ic: string;
  session_date: string;
  aim: string;
  participants: string;
  rooming: string;
  equipment: string;
  situation: string;
  mission: string;
  execution: string;
  any_questions: string;
  check_understanding: string;
  timetable: TimetableRow[];
  notes: string;
}

export const EMPTY_PLAN: SessionPlanContent = {
  session_name: "",
  session_ic: "",
  session_date: "",
  aim: "",
  participants: "",
  rooming: "",
  equipment: "",
  situation: "",
  mission: "",
  execution: "",
  any_questions: "",
  check_understanding: "",
  timetable: [],
  notes: "",
};

/** Every plain-text field of a plan — i.e. everything bar the timetable rows. */
export type SessionPlanTextKey = Exclude<keyof SessionPlanContent, "timetable">;

/** Header block — the boxes across the top of the paper sheet. */
export const HEADER_FIELDS: {
  key: SessionPlanTextKey;
  label: string;
  hint: string;
  type?: "date";
  multiline?: boolean;
}[] = [
  { key: "session_name", label: "Session Name", hint: "What is it called" },
  { key: "session_ic", label: "Session I/C", hint: "Who is running the session" },
  { key: "session_date", label: "Date", hint: "When is it taking place", type: "date" },
  { key: "participants", label: "No. of people participating", hint: "Rough numbers" },
  { key: "rooming", label: "Rooming", hint: "Where are you doing it" },
  { key: "equipment", label: "Equipment Needed", hint: "What do you need", multiline: true },
  {
    key: "aim",
    label: "Aim / Goal of the session",
    hint: "By the end of the session what do you want to have achieved",
    multiline: true,
  },
];

/** The five-part section plan, with the sheet's own guidance as the hint. */
export const PLAN_SECTIONS: {
  key: SessionPlanSectionKey;
  label: string;
  hint: string;
}[] = [
  {
    key: "situation",
    label: "Situation",
    hint: "Explain what is happening and set the context. What are we doing and why?",
  },
  {
    key: "mission",
    label: "Mission",
    hint: "State the main task or goal clearly and simply.",
  },
  {
    key: "execution",
    label: "Execution",
    hint: "Explain how the task will be carried out, including key steps, roles and boundaries. This is the main bit — detail how it all comes together.",
  },
  {
    key: "any_questions",
    label: "Any Questions",
    hint: "Give learners the opportunity to ask questions or clarify anything they are unsure about.",
  },
  {
    key: "check_understanding",
    label: "Check Understanding",
    hint: "Confirm everyone understands the task — ask them to explain it back or demonstrate key points.",
  },
];

/** Fields the API insists on before a plan can be submitted. */
export const REQUIRED_TO_SUBMIT: {
  key: SessionPlanTextKey;
  label: string;
}[] = [
  { key: "session_name", label: "Session name" },
  { key: "aim", label: "Aim/goal" },
  { key: "situation", label: "Situation" },
  { key: "mission", label: "Mission" },
  { key: "execution", label: "Execution" },
];

/** Which required fields are still blank — drives the submit button's tooltip. */
export function missingForSubmit(plan: SessionPlanContent): string[] {
  return REQUIRED_TO_SUBMIT.filter((f) => !plan[f.key].trim()).map((f) => f.label);
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export const STATUS_LABELS: Record<SessionPlanStatus, string> = {
  draft: "Draft",
  submitted: "Awaiting review",
  amendments_requested: "Amendments needed",
  approved: "Approved",
};

export const STATUS_STYLE: Record<
  SessionPlanStatus,
  { variant: BadgeVariant; className?: string }
> = {
  draft: { variant: "outline", className: "text-muted-foreground" },
  submitted: {
    variant: "outline",
    className: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  amendments_requested: {
    variant: "outline",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-500",
  },
  approved: {
    variant: "outline",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
};

export const ATTACHMENT_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** Strip a detail response down to just the editable content. */
export function contentOf(plan: SessionPlanDetail): SessionPlanContent {
  return {
    session_name: plan.session_name,
    session_ic: plan.session_ic,
    // The API returns a full ISO timestamp; <input type="date"> wants YYYY-MM-DD.
    session_date: plan.session_date ? plan.session_date.slice(0, 10) : "",
    aim: plan.aim,
    participants: plan.participants,
    rooming: plan.rooming,
    equipment: plan.equipment,
    situation: plan.situation,
    mission: plan.mission,
    execution: plan.execution,
    any_questions: plan.any_questions,
    check_understanding: plan.check_understanding,
    timetable: plan.timetable ?? [],
    notes: plan.notes,
  };
}
