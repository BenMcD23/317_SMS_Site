import { describe, expect, it } from "vitest";

import {
  type LeavingCadet,
  attendanceText,
  bccFor,
  cadetsToEmail,
  fillLeavingEmail,
  gmailComposeUrl,
  leaverQueryDraft,
} from "@/lib/leaving";

const c = (over: Partial<LeavingCadet>): LeavingCadet => ({
  cin: 1,
  name: "A B",
  rank: null,
  flight: null,
  parentEmails: [],
  lastAttended: null,
  gapDays: null,
  weeksAbsent: null,
  attended: 0,
  possible: 0,
  attendancePct: null,
  status: "flagged",
  daysLeft: null,
  returned: false,
  notifiedAt: null,
  notifiedBy: null,
  adjRequestedAt: null,
  ...over,
});

describe("leaverQueryDraft", () => {
  it("names the cadet, their attendance and the two weeks' notice", () => {
    const draft = leaverQueryDraft("Zoë Ó Briain", 9, undefined, { attended: 2, possible: 8 });
    expect(draft).toContain(
      "Zoë Ó Briain's attendance has dropped — they've been to 2 of the last 8 parade nights"
    );
    expect(draft).toContain("within two weeks");
  });

  it("copes with a cadet with nothing to measure", () => {
    expect(leaverQueryDraft("Sam Smith", null)).toContain("to very few recent parade nights");
    expect(leaverQueryDraft("Sam Smith", null, undefined, { attended: 0, possible: 0 })).toContain(
      "to very few recent parade nights"
    );
  });

  it("says 'night' for a cadet who has only had one parade night to attend", () => {
    expect(attendanceText({ attended: 1, possible: 1 })).toBe("1 of the last 1 parade night");
  });

  it("still fills the weeks_absent placeholder in an OC's saved template", () => {
    expect(
      leaverQueryDraft(
        "Sam",
        9,
        { subject: "", body: "Away {{ weeks_absent }}" },
        { attended: 0, possible: 8 }
      )
    ).toBe("Away around 9 weeks");
  });

  it("uses the OC's own template when given one", () => {
    expect(leaverQueryDraft("Sam Smith", 8, { subject: "Re {{ cadet_name }}", body: "Hi" })).toBe(
      "Subject: Re Sam Smith\n\nHi"
    );
  });

  it("leaves out the subject line when the OC saved no subject", () => {
    expect(leaverQueryDraft("Sam Smith", 8, { subject: "", body: "Hi" })).toBe("Hi");
  });
});

describe("fillLeavingEmail", () => {
  it("fills the placeholder however it is spaced, every time it appears", () => {
    expect(fillLeavingEmail("{{cadet_name}}, {{ cadet_name }} and {{  cadet_name}}", "Sam", 8)).toBe(
      "Sam, Sam and Sam"
    );
  });

  it("leaves an unknown placeholder as typed so a typo is visible", () => {
    expect(fillLeavingEmail("Dear {{ parent_name }}", "Sam", 8)).toBe("Dear {{ parent_name }}");
  });

  it("does not treat $ patterns in a name as replacement syntax", () => {
    expect(fillLeavingEmail("{{ cadet_name }}", "$& $1 O'Neil", null)).toBe("$& $1 O'Neil");
  });
});

describe("cadetsToEmail and bccFor", () => {
  it("keeps only flagged cadets who haven't returned", () => {
    const list = [
      c({ cin: 1 }),
      c({ cin: 2, status: "waiting" }),
      c({ cin: 3, status: "start_leaving" }),
      c({ cin: 4, returned: true }),
    ];
    expect(cadetsToEmail(list).map((x) => x.cin)).toEqual([1]);
    expect(cadetsToEmail([])).toEqual([]);
  });

  it("lists siblings' shared address once, ignoring case", () => {
    expect(
      bccFor([c({ parentEmails: ["Mum@x.co", "dad@x.co"] }), c({ cin: 2, parentEmails: ["mum@x.co"] })])
    ).toBe("Mum@x.co;dad@x.co");
    expect(bccFor([c({})])).toBe("");
  });
});

describe("gmailComposeUrl", () => {
  it("encodes spaces as %20 and newlines so Gmail keeps the layout", () => {
    const url = gmailComposeUrl({
      account: "oc@x.co",
      bcc: "a@x.co;b@x.co",
      subject: "A & B",
      body: "Hi\nthere",
    });
    expect(url).toBe(
      "https://mail.google.com/mail/?view=cm&fs=1&bcc=a%40x.co%2Cb%40x.co&su=A%20%26%20B&body=Hi%0Athere&authuser=oc%40x.co"
    );
    expect(url).not.toContain("+");
  });

  it("omits authuser when the account is unknown", () => {
    expect(gmailComposeUrl({ account: undefined, bcc: "a@x.co", subject: "", body: "" })).not.toContain(
      "authuser"
    );
  });
});
