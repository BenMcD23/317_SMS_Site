"use client";

import { usePersonalDataHidden } from "@/lib/privacy";
import { SectionHeading } from "@/components/section-heading";
import { formatDate } from "@/lib/format";
import type { Option, Person, RecruitDetail } from "@/lib/recruits";

/**
 * A recruit's joining-form answers, read top to bottom in the form's own
 * order. Shown while the parent is still going (so staff can see what's in)
 * and after, beside the PDFs. Labels come from the API's option lists.
 */

// `personal` rows are removed by "Hide personal data"; names stay.
type Row = [label: string, value: React.ReactNode, personal?: boolean];

const yesNo = (v: unknown) => (v === true ? "Yes" : v === false ? "No" : null);
const label = (options: Option[], key: string | null | undefined) =>
  key ? (options.find((o) => o.key === key)?.label ?? key) : null;
const labels = (options: Option[], keys: string[]) => keys.map((k) => label(options, k)).join(", ");

const GENDER = { male: "Male", female: "Female", pnts: "Prefer not to say", other: "Other" };
const PRONOUN = { he: "He/Him", she: "She/Her", they: "They/Them" };

function address(p: Partial<Person>): string {
  return [
    p.property && p.street ? `${p.property} ${p.street}` : p.property || p.street,
    p.area,
    p.town,
    p.county,
    p.postcode,
    p.country,
  ]
    .filter(Boolean)
    .join(", ");
}

function personRows(p: Person): Row[] {
  return [
    ["Name", [p.title, p.fullName].filter(Boolean).join(" ")],
    ["Relationship", p.relationship],
    ["Address", address(p), true],
    ["Mobile", p.mobile, true],
    ["Home phone", p.homePhone, true],
    ["Email", p.email, true],
    ["Second email", p.email2, true],
  ];
}

/** `personal` marks a section that is personal throughout (medical), removed whole. */
function Section({ title, rows, personal = false }: { title: string; rows: Row[]; personal?: boolean }) {
  const [hidden] = usePersonalDataHidden();
  const filled = rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
  const shown = hidden ? filled.filter(([, , rowPersonal]) => !rowPersonal) : filled;
  // While hidden, a section with nothing left goes entirely: "Nothing filled in
  // yet" under a heading would be untrue, and says something was there.
  if (
    hidden &&
    (personal || rows.every(([, , rowPersonal]) => rowPersonal) || (filled.length && !shown.length))
  )
    return null;
  return (
    <section className="flex flex-col gap-2">
      <SectionHeading title={title} />
      {shown.length ? (
        <dl className="divide-y rounded-lg border text-sm">
          {shown.map(([k, v]) => (
            <div key={k} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[14rem_1fr] sm:gap-4">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-muted-foreground text-sm">Nothing filled in yet.</p>
      )}
    </section>
  );
}

export function RecruitAnswers({ recruit }: { recruit: RecruitDetail }) {
  const { data: d, options: o } = recruit;
  const m = d.medical;

  const consentRows: Row[] = o.consents.map(({ key, label: text }) => {
    const answer = yesNo(d.consent[key]);
    if (key === "accommodation" && d.consent.accommodation)
      return [text, `Yes: ${labels(o.accommodation, d.consent.accommodationTypes)}`];
    return [text, answer];
  });

  const medicalRows: Row[] = [["Any conditions, allergies or dietary needs", yesNo(m.has)]];
  if (m.has) {
    medicalRows.push(
      ["Conditions", labels(o.conditions, m.conditions)],
      ["Education, Health and Care Plan", yesNo(m.ehcPlan)],
      ["Will share the plan", m.ehcPlan ? yesNo(m.ehcCopy) : null],
      ...m.details.map((c, i): Row => [
        `Condition ${i + 1}`,
        <div key={i} className="flex flex-col gap-1">
          <span className="font-medium">
            {c.name}
            {c.severity && ` (${c.severity})`}
          </span>
          {c.soughtAdvice !== null && <span>Sought medical advice: {yesNo(c.soughtAdvice)}</span>}
          {c.routine && <span>Day to day: {c.routine}</span>}
          {c.strenuous && <span>Strenuous activity: {c.strenuous}</span>}
          {c.control && <span>Can control it: {c.control}</span>}
          {c.medication && (
            <span>Medication: {[c.medication, c.dosage, c.storage].filter(Boolean).join(" · ")}</span>
          )}
        </div>,
      ]),
      [
        "Allergies",
        Object.entries(m.allergies)
          .map(([k, a]) =>
            [label(o.allergies, k), a.severity, a.autoInjector ? "auto-injector" : null]
              .filter(Boolean)
              .join(", ")
          )
          .join("; "),
      ],
      ["Other allergy", m.allergyOther],
      ["Diet", labels(o.diets, m.diet)],
      ["Other dietary need", m.dietOther]
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Cadet"
        rows={[
          ["Full name", d.cadet.fullName],
          ["Date of birth", d.cadet.dob ? formatDate(d.cadet.dob) : null, true],
          ["Religion", d.cadet.religion, true],
          [
            "Gender",
            d.cadet.gender &&
              (d.cadet.gender === "other" ? `Other: ${d.cadet.genderOther}` : GENDER[d.cadet.gender]),
            true,
          ],
          ["Pronoun", d.cadet.pronoun && PRONOUN[d.cadet.pronoun]],
          ["Ethnicity", label(o.ethnicities, d.cadet.ethnicity), true],
          ["Local authority involvement", yesNo(d.cadet.externalAgency), true],
        ]}
      />
      <Section
        title="Cadet's contact details"
        rows={[
          ["Address", address(d.contact), true],
          ["Mobile", d.contact.mobile, true],
          ["Home phone", d.contact.homePhone, true],
          ["Email", d.contact.email, true],
          ["Second email", d.contact.email2, true],
        ]}
      />
      <Section
        title="Previous youth organisations"
        rows={[
          ...o.organisations.map(({ key, label: text }): Row => [text, yesNo(d.history[key])]),
          ["Other", d.history.other],
        ]}
      />
      <Section
        title="Parent or guardian"
        rows={[["Has parental responsibility", yesNo(d.nok.hasParentalResponsibility)], ...personRows(d.nok)]}
      />
      {d.extra.fullName && <Section title="Additional contact" rows={personRows(d.extra)} />}
      <Section title="Consent" rows={consentRows} />
      <Section title="Medical, allergies and diet" rows={medicalRows} personal />
      <Section
        title="About joining"
        rows={[
          ["School", d.about.school],
          ["Heard about us", d.about.heardFrom],
          ["Reason for joining", d.about.reason],
        ]}
      />
      {recruit.submittedAt && (
        <Section
          title="Signed"
          rows={[
            ["Parent or guardian", `${d.signer.forename} ${d.signer.surname}`],
            [
              "Parent's signature",
              recruit.parentSignature && (
                // eslint-disable-next-line @next/next/no-img-element -- a data URL, nothing to optimise
                <img
                  src={recruit.parentSignature}
                  alt="Parent's signature"
                  className="h-14 rounded border bg-white p-1"
                />
              ),
              true,
            ],
            [
              "Cadet's signature (health declaration)",
              recruit.cadetSignature && (
                // eslint-disable-next-line @next/next/no-img-element -- a data URL, nothing to optimise
                <img
                  src={recruit.cadetSignature}
                  alt="Cadet's signature"
                  className="h-14 rounded border bg-white p-1"
                />
              ),
              true,
            ],
            ["Signed on", formatDate(recruit.submittedAt)],
          ]}
        />
      )}
    </div>
  );
}
