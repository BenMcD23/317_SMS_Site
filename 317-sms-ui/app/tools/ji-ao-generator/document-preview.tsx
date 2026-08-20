"use client";

/**
 * On-screen rewrite of the two Word templates in app/word_templates.
 *
 * Every static line here is copied verbatim from the .docx, and every editable
 * box sits exactly where that template's {{ placeholder }} sits — so what the
 * page shows is what the generated document says. If a template changes, this
 * has to change with it.
 *
 * The sheet deliberately stays white in dark mode: it is a preview of a printed
 * page, not part of the app chrome.
 */

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

export type Fields = Record<string, string>;
type Set = (key: string, value: string) => void;

/** A4 at 96dpi is 794px wide; the templates use ~1in margins and Arial. */
function Sheet({ size, children }: { size: string; children: React.ReactNode }) {
  return (
    // The sheet is a fixed 794px so it keeps document proportions — it scrolls
    // inside this wrapper rather than making the whole page scroll sideways.
    <div className="overflow-x-auto rounded-lg border bg-muted/40 p-3 sm:p-6">
      <div
        className="mx-auto w-[794px] bg-white px-[72px] py-[64px] text-black shadow-lg ring-1 ring-black/10"
        style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: size, lineHeight: 1.4 }}
      >
        {children}
      </div>
    </div>
  );
}

/** Blank paragraph — the templates use these for spacing, so mirror them. */
function Gap({ n = 1 }: { n?: number }) {
  return <div aria-hidden style={{ height: `${n * 1.4}em` }} />;
}

const editableBase =
  "rounded-[3px] bg-sky-50 text-black outline-none ring-1 ring-inset ring-sky-200 transition " +
  "hover:bg-sky-100 focus:bg-white focus:ring-2 focus:ring-sky-500 " +
  "placeholder:text-sky-700/40";

/** Short value that sits inside a sentence — sized to its own content. */
function Inline({
  value,
  onChange,
  label,
  min = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  min?: number;
}) {
  return (
    <input
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: `${Math.max(value.length, min) + 1}ch` }}
      className={cn(editableBase, "px-1 font-[inherit] text-[inherit] leading-[inherit]")}
    />
  );
}

/** Full-width value on its own line, growing with its content. */
function Block({
  value,
  onChange,
  label,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <textarea
      aria-label={label}
      value={value}
      placeholder={placeholder}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        editableBase,
        "field-sizing-content block w-full resize-none px-1 py-px font-[inherit] text-[inherit] leading-[inherit]",
        className
      )}
    />
  );
}

/** Where the signature image is stamped in — it can't be edited here, so show
 *  what will land there rather than pretending the space is empty. */
function SignatureBlock({ name }: { name: string }) {
  return (
    <div className="mt-2 w-fit rounded-[3px] border border-dashed border-neutral-300 px-3 py-2 text-neutral-500">
      <span className="italic">[signature image for {name.trim().split(" ").pop() || "—"}]</span>
      <div className="mt-1 text-black">{name} RAFAC</div>
    </div>
  );
}

function AiButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <Button type="button" size="sm" variant="secondary" disabled={loading} onClick={onClick}>
      {loading ? <Spinner data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
      Write with AI
    </Button>
  );
}

/** Label above an editable region, outside the sheet's document flow. */
function FieldNote({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 flex items-center gap-2 text-[9pt] text-neutral-400">{children}</div>;
}

export function JiPreview({
  f,
  set,
  onAi,
  aiLoading,
}: {
  f: Fields;
  set: Set;
  onAi: () => void;
  aiLoading: boolean;
}) {
  return (
    <Sheet size="11pt">
      <div className="text-[16pt] font-bold">317 (Failsworth) Squadron Air Training Corps</div>
      <div className="text-center">
        Army Reserve Centre Failsworth&nbsp;&nbsp;&nbsp;&nbsp;Oldham&nbsp;&nbsp;&nbsp;&nbsp;M35 0BH
      </div>
      <Gap />
      <div className="text-center">Tel: 0161 688 6705</div>
      <div className="text-center">Email: training.317@rafac.mod.gov.uk</div>
      <Gap />
      <div className="flex items-center justify-center gap-1">
        Contact: <Inline label="Adult IC" value={f.adult_ic} onChange={(v) => set("adult_ic", v)} min={16} />
      </div>
      <Gap n={2} />

      <div className="text-center font-bold">
        <Block label="Title" className="text-center font-bold" value={f.title} onChange={(v) => set("title", v)} />
      </div>
      <div className="text-center font-bold">
        <Block
          label="Dates"
          className="text-center font-bold"
          value={f.date_from_to}
          onChange={(v) => set("date_from_to", v)}
        />
      </div>
      <Gap />

      <FieldNote>
        Description
        <AiButton onClick={onAi} loading={aiLoading} />
      </FieldNote>
      <Block
        label="Description"
        value={f.description}
        onChange={(v) => set("description", v)}
        placeholder="What the event is, for cadets and parents…"
      />
      <Gap />

      <div className="font-bold">Location:</div>
      <Block label="Location" value={f.location} onChange={(v) => set("location", v)} />
      <Gap />

      <div className="font-bold">Timings:</div>
      <div className="flex flex-wrap items-center gap-1">
        Cadets are required to arrive at
        <Inline label="Arrival time" value={f.arrival_time} onChange={(v) => set("arrival_time", v)} min={5} />
        on the
        <Inline label="Arrival date" value={f.arrival_date} onChange={(v) => set("arrival_date", v)} min={10} />.
      </div>
      <Gap />
      <div className="flex flex-wrap items-center gap-1">
        Departure time will be at
        <Inline label="Departure time" value={f.departure_time} onChange={(v) => set("departure_time", v)} min={5} />
        on the
        <Inline label="Departure date" value={f.departure_date} onChange={(v) => set("departure_date", v)} min={10} />.
      </div>
      <Gap />

      <div className="font-bold">Cost:</div>
      <Block label="Cost" value={f.cost} onChange={(v) => set("cost", v)} />
      <Gap />

      <div className="font-bold">Uniform:</div>
      <Block label="Uniform" value={f.dress} onChange={(v) => set("dress", v)} />
      <Gap />

      <div className="font-bold">Admin:</div>
      <Block label="Admin" value={f.tg_form_req} onChange={(v) => set("tg_form_req", v)} />
      <Gap n={3} />

      <div className="flex flex-wrap items-center gap-1">
        All enquiries regarding the course should be directed to the course IC (
        <Inline label="Course IC name" value={f.adult_ic} onChange={(v) => set("adult_ic", v)} min={16} />
        <Inline
          label="Course IC email"
          value={f.adult_ic_email}
          onChange={(v) => set("adult_ic_email", v)}
          min={24}
        />
        )
      </div>
      <Gap n={2} />
      <SignatureBlock name={f.adult_ic} />
    </Sheet>
  );
}

/** Numbered top-level AO section (Word renders these as "1.", "2.", …). */
function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="flex gap-3">
        <span className="w-6 shrink-0">{n}.</span>
        <span className="font-bold">{title}</span>
      </div>
      <div className="mt-2 pl-9">{children}</div>
    </div>
  );
}

/** Lettered sub-item ("a.", "b.", …) inside a section. */
function Sub({ letter, title, children }: { letter: string; title?: string; children?: React.ReactNode }) {
  return (
    <div className="mt-2">
      <div className="flex gap-3">
        <span className="w-5 shrink-0">{letter}.</span>
        <span className={title ? "font-bold" : undefined}>{title ?? children}</span>
      </div>
      {title && children ? <div className="mt-1 pl-8">{children}</div> : null}
    </div>
  );
}

export function AoPreview({
  f,
  set,
  onAi,
  aiLoading,
}: {
  f: Fields;
  set: Set;
  onAi: () => void;
  aiLoading: boolean;
}) {
  return (
    <Sheet size="12pt">
      <div className="text-[14pt] font-bold">317 Failsworth Squadron</div>
      {/* Verbatim from the template, double space and missing word included —
          the preview mirrors the document rather than quietly correcting it. */}
      <div className="text-[14pt] font-bold">Greater&nbsp; Wing</div>
      <div className="text-[14pt] font-bold">Air Training Corps</div>
      <Gap />
      <div className="whitespace-pre-line">
        {"Failsworth Army Reserve Centre\nOldham Road\nFailsworth\nM35 0BH"}
      </div>
      <div>Tel: 0161 688 6705</div>
      <div>Email: training.317@aircadets.org</div>
      <Gap />
      <div className="flex justify-center">
        <Inline label="Date" value={f.todays_date} onChange={(v) => set("todays_date", v)} min={16} />
      </div>
      <Gap />

      <div className="flex flex-wrap items-center gap-1">
        Ref: <Inline label="Event reference" value={f.event_ref} onChange={(v) => set("event_ref", v)} min={22} />
      </div>
      <div>See Distribution</div>
      <Gap />
      <div>References:</div>
      <div>A. ACP 5</div>
      <Gap />
      <div>Time zone used through this order: LOCAL</div>
      <Gap />

      <div className="text-[14pt] font-bold">
        <Block
          label="Event title"
          className="text-[14pt] font-bold"
          value={f.event_title}
          onChange={(v) => set("event_title", v)}
        />
      </div>

      <Section n={1} title="General">
        <div className="flex flex-wrap items-center gap-1">
          Cadets from 317 Sqn will attend a course at
          <Inline
            label="Event location"
            value={f.event_location}
            onChange={(v) => set("event_location", v)}
            min={22}
          />
          from
          <Inline label="Date from" value={f.date_from} onChange={(v) => set("date_from", v)} min={10} />
          to
          <Inline label="Date to" value={f.date_to} onChange={(v) => set("date_to", v)} min={10} />
        </div>
        <Gap />
        <div>The following individuals are appointed into specific roles:</div>
        <Gap />
        <div className="font-bold">Course Coordinator</div>
        <Block label="Course coordinator" value={f.course_ic} onChange={(v) => set("course_ic", v)} />
      </Section>

      <Section n={2} title="Location">
        <Block
          label="Location"
          value={f.event_location}
          onChange={(v) => set("event_location", v)}
        />
      </Section>

      <Section n={3} title="Arrival">
        <div className="flex flex-wrap items-center gap-1">
          Instructors will arrive at
          <Inline
            label="Instructor start time"
            value={f.instructor_start_time}
            onChange={(v) => set("instructor_start_time", v)}
            min={5}
          />
          . Cadets to arrive for a prompt start at
          <Inline
            label="Cadet start time"
            value={f.cadet_start_time}
            onChange={(v) => set("cadet_start_time", v)}
            min={5}
          />
          .
        </div>
      </Section>

      <Section n={4} title="Departure">
        <div className="flex flex-wrap items-center gap-1">
          Cadets are scheduled to depart at
          <Inline
            label="Departure time"
            value={f.departure_time}
            onChange={(v) => set("departure_time", v)}
            min={5}
          />
          . Allow upto 15 minutes for potential delays
        </div>
      </Section>

      <Section n={5} title="Administration">
        <div>The nominal roll will be confirmed through SMS once bidding has closed</div>
      </Section>

      <Section n={6} title="Security">
        <Sub letter="a">
          All cadets and staff are to be in possession of identification. Cadets will be required to have their RAF
          Form 3822 / MyRAFAC App and uniformed staff a MOD F90. Civilian Instructors are to have suitable
          photographic ID such as driving licence.
        </Sub>
        <Sub letter="b">
          Nominal roll is to be finalised and confirmed on SMS prior to event and updated if any changes occur.
        </Sub>
      </Section>

      <Section n={7} title="Messing">
        <div>
          With no exception meals will not be provided for / by staff &amp; cadets. Attendees are advised to bring
          lunch.
        </div>
      </Section>

      <Section n={8} title="Supervision and Protection">
        <Sub letter="a" title="Supervision">
          Course has adequate adult staff provision, including female staff.
        </Sub>
        <Sub letter="b" title="Course Location">
          Squadron building used for training is within a compound which will be secure during course duration. All
          attendees will be given HSE brief on arrival.
        </Sub>
        <Sub letter="c" title="Leaving training location before end of course">
          Full course will be conducted within the squadron grounds, attendees wishing to go off-site during lunch may
          do so but must notify the directing staff.
        </Sub>
      </Section>

      <Section n={9} title="Discipline">
        <div>
          All Cadets and staff are expected to always maintain the highest standards of discipline; any poor behaviour
          or breaches of discipline will result in the training being cancelled immediately.
        </div>
      </Section>

      <Section n={10} title="Accommodation">
        <div>Course is non-residential, no accommodation is necessary.</div>
      </Section>

      <Section n={11} title="Training">
        <div>No prior training is required for this course.</div>
      </Section>

      <Section n={12} title="Stores">
        <div>N/A</div>
      </Section>

      <Section n={13} title="Accounting">
        <Sub letter="a" title="Pay and Allowances">
          If required for the event there will be a CACE form added to the application.
        </Sub>
        <Sub letter="b" title="Accommodation Charges">
          There are no accommodation charges.
        </Sub>
        <Sub letter="c" title="Messing Charges">
          There are no messing charges.
        </Sub>
      </Section>

      <Section n={14} title="Contract Management">
        <div>N/A</div>
      </Section>

      <Section n={15} title="Transport">
        <div>
          Private staff vehicles are to be used to and from venue. Parking is available within the squadron compound
          for all attendees. Cadets are to be taken to venue by parents and collected at agreed recovery time. For
          public transport, main bus and tram routes run within a 5-minute walk of the squadron.
        </div>
      </Section>

      <Gap n={2} />
      {/* The AO template has no placeholder for this — the generator inserts it
          above the signature, and only when it isn't empty. */}
      <FieldNote>
        Activity Description — optional, left out of the document if blank
        <AiButton onClick={onAi} loading={aiLoading} />
      </FieldNote>
      {f.description.trim() ? <div className="font-bold">Activity Description:</div> : null}
      <Block
        label="Activity description"
        value={f.description}
        onChange={(v) => set("description", v)}
        placeholder="Optional — what the activity is, for staff reading the order…"
      />

      <Gap n={2} />
      <SignatureBlock name={f.adult_ic} />
      <div className="mt-2">For OC 317</div>
    </Sheet>
  );
}
