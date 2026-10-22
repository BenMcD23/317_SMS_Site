import { describe, expect, it } from "vitest";
import { type BadgeToGive, completeOrderBlockers, countByStage } from "@/lib/badge-orders";

const given = { givenAt: "2026-10-01T18:00:00" };

describe("completeOrderBlockers", () => {
  it("lets an order complete once every badge has been given", () => {
    expect(completeOrderBlockers({ items: [given, given] })).toEqual([]);
  });

  it("blocks while a badge is still ungiven, even if it was never marked received", () => {
    expect(completeOrderBlockers({ items: [given, { givenAt: null }] })).toEqual(["1 badge not yet given"]);
  });

  it("pluralises the count", () => {
    expect(completeOrderBlockers({ items: [{}, { givenAt: null }] })).toEqual(["2 badges not yet given"]);
  });

  it("treats an order with no items as completable", () => {
    expect(completeOrderBlockers({ items: [] })).toEqual([]);
  });
});

describe("countByStage", () => {
  const badge = (stage: string) => ({ stage }) as BadgeToGive;

  it("counts each stage and reports the empty ones as zero", () => {
    expect(countByStage([badge("notified"), badge("not_ordered"), badge("not_ordered")])).toEqual({
      notified: 1,
      in_hand: 0,
      on_order: 0,
      queued: 0,
      not_ordered: 2,
    });
  });

  it("ignores a stage the site doesn't know rather than inventing a bucket", () => {
    expect(Object.keys(countByStage([badge("lost_in_post")]))).not.toContain("lost_in_post");
  });
});
