import { describe, expect, it } from "vitest";

import {
  OWN_RANK,
  formFromPerson,
  personFormData,
  personSchema,
  photoUrl,
  type PersonForm,
} from "@/lib/website-people";

const photo = () => new File(["x"], "me.jpg", { type: "image/jpeg" });
const form = (v: Partial<PersonForm> = {}): PersonForm => ({
  rank: "Sgt",
  name: "C Mack",
  sortAs: OWN_RANK,
  photo: null,
  ...v,
});

describe("personSchema", () => {
  it("an NCO being added needs a photo, because the website has no NCO placeholder", () => {
    const res = personSchema("ncos", true).safeParse(form());
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]).toMatchObject({ path: ["photo"], message: "Add a photo" });
    expect(personSchema("ncos", true).safeParse(form({ photo: photo() })).success).toBe(true);
  });

  it("staff can be added without a photo (they get the placeholder)", () => {
    expect(personSchema("staff", true).safeParse(form({ rank: "CI" })).success).toBe(true);
  });

  it("an edit keeps the old photo, so none is needed", () => {
    expect(personSchema("ncos", false).safeParse(form()).success).toBe(true);
  });

  it.each([
    [{ rank: "" }, "Choose a rank"],
    [{ name: "   " }, "Enter a name"],
    [{ name: "x".repeat(61) }, "At most 60 characters"],
    // The API addresses people by name in the URL.
    [{ name: "A/B" }, "Leave out the slash"],
  ])("%o is rejected with %s", (v, message) => {
    const res = personSchema("staff", false).safeParse(form(v));
    expect(res.error?.issues[0].message).toBe(message);
  });
});

describe("personFormData", () => {
  it("tidies the name and sends the rank and photo", () => {
    const file = photo();
    const body = personFormData(form({ name: "  C   Mack ", photo: file }), "ncos");
    expect(body.get("rank")).toBe("Sgt");
    expect(body.get("name")).toBe("C Mack");
    expect(body.get("file")).toBe(file);
  });

  it("leaves list-under out for 'their own rank', which is how the API clears it", () => {
    expect(personFormData(form({ rank: "CI" }), "staff").has("sort_as")).toBe(false);
    expect(personFormData(form({ rank: "CI", sortAs: "Wg Cdr (Ret'd)" }), "staff").get("sort_as")).toBe(
      "Wg Cdr (Ret'd)"
    );
  });

  it("never sends list-under for an NCO", () => {
    expect(personFormData(form({ sortAs: "FS" }), "ncos").has("sort_as")).toBe(false);
  });

  it("sends no file when no new photo was picked, so the old one stays", () => {
    expect(personFormData(form(), "staff").has("file")).toBe(false);
  });
});

describe("formFromPerson", () => {
  it("starts empty for someone new, and from their entry for an edit", () => {
    expect(formFromPerson(null)).toEqual({ rank: "", name: "", sortAs: OWN_RANK, photo: null });
    expect(
      formFromPerson({ rank: "CI", name: "Roy", image: "r.webp", sortAs: "Wg Cdr (Ret'd)" })
    ).toMatchObject({
      sortAs: "Wg Cdr (Ret'd)",
    });
  });
});

describe("photoUrl", () => {
  it("escapes the spaces some of the old file names have", () => {
    expect(photoUrl("ncos", "FS Beverley.webp")).toBe(
      "https://raw.githubusercontent.com/BenMcD23/cadet-website/master/src/assets/nco_pics/FS%20Beverley.webp"
    );
  });
});
