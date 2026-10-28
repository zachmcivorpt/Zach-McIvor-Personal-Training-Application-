import { describe, expect, it } from "vitest";
import { tierFromEntitlement, activeStore, canUse, gatesLive, canSaveNewSession, savedSessionLimit, sourceActive, PLANS, formatPlanPrice } from "./soloAccess";

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

describe("Train Solo tiers", () => {
  it("no entitlement doc is Free", () => {
    expect(tierFromEntitlement(null, NOW)).toBe("free");
    expect(tierFromEntitlement({}, NOW)).toBe("free");
  });

  it("an active or trialing subscription gives its tier", () => {
    expect(tierFromEntitlement({ sources: { stripe: { tier: "plus", status: "active", expiresAt: NOW + DAY } } }, NOW)).toBe("plus");
    expect(tierFromEntitlement({ sources: { apple: { tier: "all_access", status: "trialing", expiresAt: NOW + DAY } } }, NOW)).toBe("all_access");
  });

  it("a failed payment drops straight to Free (owner rule: no paid access without payment)", () => {
    for (const status of ["past_due", "unpaid", "incomplete", "incomplete_expired", "canceled", "billing_issue"]) {
      expect(tierFromEntitlement({ sources: { stripe: { tier: "all_access", status, expiresAt: NOW + 20 * DAY } } }, NOW)).toBe("free");
    }
  });

  it("an expiry date in the past is Free even if the server never sent an update", () => {
    expect(tierFromEntitlement({ sources: { apple: { tier: "all_access", status: "active", expiresAt: NOW - 1 } } }, NOW)).toBe("free");
    expect(sourceActive({ tier: "plus", status: "active", expiresAt: NOW }, NOW)).toBe(false);
  });

  it("the best paid-up store wins, and says which store it is", () => {
    const ent = {
      sources: {
        stripe: { tier: "plus", status: "active", expiresAt: NOW + DAY },
        apple: { tier: "all_access", status: "active", expiresAt: NOW + DAY },
      },
    };
    expect(tierFromEntitlement(ent, NOW)).toBe("all_access");
    expect(activeStore(ent, NOW)).toBe("apple");
    ent.sources.apple.expiresAt = NOW - 1;
    expect(tierFromEntitlement(ent, NOW)).toBe("plus");
    expect(activeStore(ent, NOW)).toBe("stripe");
  });

  it("a made-up tier name never unlocks anything", () => {
    expect(tierFromEntitlement({ sources: { stripe: { tier: "vip", status: "active", expiresAt: NOW + DAY } } }, NOW)).toBe("free");
  });
});

describe("gates", () => {
  it("before launch everything free today stays free, the catalogue stays per-program", () => {
    for (const f of ["suggestedWeights", "programBuilder", "fullStats", "appleHealthProgress", "recoveryAddons", "unlimitedSessions"]) {
      expect(canUse(f, { tier: "free", live: false })).toBe(true);
    }
    expect(canUse("catalogue", { tier: "free", live: false })).toBe(false);
    expect(savedSessionLimit({ tier: "free", live: false })).toBe(Infinity);
  });

  it("after launch: Free / Plus / All Access unlock what the plan says", () => {
    const free = { tier: "free", live: true };
    const plus = { tier: "plus", live: true };
    const all = { tier: "all_access", live: true };
    expect(canUse("suggestedWeights", free)).toBe(false);
    expect(canUse("suggestedWeights", plus)).toBe(true);
    expect(canUse("programBuilder", plus)).toBe(true);
    expect(canUse("catalogue", plus)).toBe(false);
    expect(canUse("catalogue", all)).toBe(true);
    expect(canUse("suggestedWeights", all)).toBe(true);
  });

  it("Free keeps up to 3 saved sessions; existing ones can always be edited", () => {
    const free = { tier: "free", live: true };
    expect(canSaveNewSession(0, free)).toBe(true);
    expect(canSaveNewSession(2, free)).toBe(true);
    expect(canSaveNewSession(3, free)).toBe(false);
    expect(canSaveNewSession(7, free)).toBe(false);
    expect(canSaveNewSession(50, { tier: "plus", live: true })).toBe(true);
  });

  it("launch switch: live for everyone, or only for listed test accounts", () => {
    expect(gatesLive(undefined, "u1")).toBe(false);
    expect(gatesLive({ live: false, testUids: ["u2"] }, "u1")).toBe(false);
    expect(gatesLive({ live: false, testUids: ["u1"] }, "u1")).toBe(true);
    expect(gatesLive({ live: true }, "u1")).toBe(true);
  });
});

describe("plans", () => {
  it("matches the approved prices and the 10-day trial on yearly only", () => {
    expect(formatPlanPrice(PLANS.plus_monthly)).toBe("A$9.99");
    expect(formatPlanPrice(PLANS.plus_yearly)).toBe("A$79.99");
    expect(formatPlanPrice(PLANS.all_access_monthly)).toBe("A$24.99");
    expect(formatPlanPrice(PLANS.all_access_yearly)).toBe("A$179.99");
    expect(PLANS.plus_yearly.trialDays).toBe(10);
    expect(PLANS.all_access_yearly.trialDays).toBe(10);
    expect(PLANS.plus_monthly.trialDays).toBe(0);
    expect(PLANS.all_access_monthly.trialDays).toBe(0);
  });
});

describe("app and server agree on plans", () => {
  it("same plans, prices and trials in soloAccess.js and functions/soloSubscriptions.js", async () => {
    const { createRequire } = await import("node:module");
    const server = createRequire(import.meta.url)("../../functions/soloSubscriptions.js").PLANS;
    expect(Object.keys(server).sort()).toEqual(Object.keys(PLANS).sort());
    for (const [key, plan] of Object.entries(PLANS)) {
      expect(server[key]).toMatchObject({ tier: plan.tier, interval: plan.interval, priceCents: plan.priceCents, trialDays: plan.trialDays });
    }
  });
});
