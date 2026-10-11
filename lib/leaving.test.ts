import { describe, expect, it } from "vitest";

import { leaverQueryDraft } from "@/lib/leaving";

describe("leaverQueryDraft", () => {
  it("names the cadet, the weeks absent and the two weeks' notice", () => {
    const draft = leaverQueryDraft("Zoë Ó Briain", 9);
    expect(draft).toContain("Zoë Ó Briain hasn't been on parade for around 9 weeks");
    expect(draft).toContain("within two weeks");
  });

  it("copes with a cadet who has no parade on record", () => {
    expect(leaverQueryDraft("Sam Smith", null)).toContain("on parade for some time");
  });
});
