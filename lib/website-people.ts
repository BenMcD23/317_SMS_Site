import { z } from "zod";

/**
 * The people on the website's Our Staff and Our NCOs pages, as the API's
 * `/website-people` serves them, and the add/edit form both dialogs share.
 * Ranks come from the API (which pins them to the website's own list), so
 * nothing here hardcodes one.
 */

export type PeopleGroup = "staff" | "ncos";

export interface WebsitePerson {
  rank: string;
  name: string;
  image: string;
  /** Staff only: the rank to sort them under instead of their own. */
  sortAs?: string;
}

export interface WebsitePeople {
  staff: WebsitePerson[];
  ncos: WebsitePerson[];
  ranks: Record<PeopleGroup, string[]>;
}

export const GROUP_LABELS: Record<PeopleGroup, string> = { staff: "Staff", ncos: "NCOs" };

/** The website's stand-in photo for staff who haven't sent one. */
export const PLACEHOLDER = "Placeholder.webp";

/** Matches the API's limit. */
export const MAX_NAME_LENGTH = 60;

/** `sortAs` empty means "their own rank": the select needs a non-empty value for it. */
export const OWN_RANK = "__own__";

const PHOTO_DIRS: Record<PeopleGroup, string> = {
  staff: "src/assets/staff_pics",
  ncos: "src/assets/nco_pics",
};

// The website repo is public, so thumbnails come straight from GitHub (as the
// gallery's do). raw.githubusercontent caches for a few minutes, so a photo
// just changed can show the old one until then; the dialog shows the new pick.
export function photoUrl(group: PeopleGroup, image: string): string {
  return `https://raw.githubusercontent.com/BenMcD23/cadet-website/master/${PHOTO_DIRS[group]}/${encodeURIComponent(image)}`;
}

/**
 * The form's rules. NCOs need a photo when they're added because the website
 * has no NCO placeholder; staff without one show the placeholder. Editing
 * never needs a new photo: the old one stays.
 */
export function personSchema(group: PeopleGroup, adding: boolean) {
  return z
    .object({
      rank: z.string().min(1, "Choose a rank"),
      name: z
        .string()
        .trim()
        .min(1, "Enter a name")
        .max(MAX_NAME_LENGTH, `At most ${MAX_NAME_LENGTH} characters`)
        .refine((v) => !v.includes("/"), "Leave out the slash"),
      sortAs: z.string(),
      photo: z.custom<File | null>((v) => v === null || v instanceof File),
    })
    .refine((v) => !(adding && group === "ncos" && !v.photo), {
      path: ["photo"],
      message: "Add a photo",
    });
}

export type PersonForm = z.infer<ReturnType<typeof personSchema>>;

export function formFromPerson(person: WebsitePerson | null): PersonForm {
  return {
    rank: person?.rank ?? "",
    name: person?.name ?? "",
    sortAs: person?.sortAs ?? OWN_RANK,
    photo: null,
  };
}

/**
 * The multipart body the API takes. Sent whole on every save: an empty form
 * field reaches the API as "not sent", so leaving `sort_as` out is how "their
 * own rank" is saved.
 */
export function personFormData(v: PersonForm, group: PeopleGroup): FormData {
  const body = new FormData();
  body.append("rank", v.rank);
  body.append("name", v.name.trim().replace(/\s+/g, " "));
  if (group === "staff" && v.sortAs && v.sortAs !== OWN_RANK) body.append("sort_as", v.sortAs);
  if (v.photo) body.append("file", v.photo);
  return body;
}

/** "Sgt C Mack", the way the website captions them. */
export function displayName(person: WebsitePerson): string {
  return `${person.rank} ${person.name}`;
}
