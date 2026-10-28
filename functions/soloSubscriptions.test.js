import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PLANS, stripeSourceFromSubscriptions, appleSourceFromSubscriber, deriveEntitlement, checkoutDecision, planFromLookupKey, lookupKey } = require("./soloSubscriptions.js");

const NOW = 1_800_000_000_000;
const sec = (ms) => Math.floor(ms / 1000);
const DAY = 86_400_000;
const sub = (plan, status, endMs, extra = {}) => ({
  id: `sub_${plan}_${status}`,
  status,
  current_period_end: sec(endMs),
  created: extra.created || 1,
  cancel_at_period_end: false,
  metadata: { soloUserId: "u1", plan },
  items: { data: [{ price: { lookup_key: lookupKey(plan) } }] },
  ...extra,
});

describe("Train Solo subscriptions: prices", () => {
  it("are the approved AUD prices, 10-day trial on yearly only", () => {
    expect(PLANS.plus_monthly.priceCents).toBe(999);
    expect(PLANS.plus_yearly.priceCents).toBe(7999);
    expect(PLANS.all_access_monthly.priceCents).toBe(2499);
    expect(PLANS.all_access_yearly.priceCents).toBe(17999);
    expect(PLANS.plus_yearly.trialDays).toBe(10);
    expect(PLANS.all_access_yearly.trialDays).toBe(10);
    expect(PLANS.plus_monthly.trialDays).toBe(0);
  });
  it("lookup keys round-trip, junk doesn't", () => {
    expect(planFromLookupKey(lookupKey("all_access_yearly"))).toBe("all_access_yearly");
    expect(planFromLookupKey("apex_solo_vip")).toBe(null);
    expect(planFromLookupKey(undefined)).toBe(null);
  });
});

describe("Stripe → entitlement", () => {
  it("an active subscription gives its tier until the period ends", () => {
    const src = stripeSourceFromSubscriptions([sub("all_access_yearly", "active", NOW + 30 * DAY)], NOW);
    expect(src).toMatchObject({ tier: "all_access", status: "active", plan: "all_access_yearly", expiresAt: sec(NOW + 30 * DAY) * 1000 });
    expect(deriveEntitlement({ stripe: src }, NOW)).toMatchObject({ tier: "all_access", allAccessUntil: src.expiresAt });
  });

  it("a failed payment (past_due / unpaid) is Free immediately, even mid-period", () => {
    for (const status of ["past_due", "unpaid", "incomplete", "canceled", "incomplete_expired", "paused"]) {
      const src = stripeSourceFromSubscriptions([sub("plus_monthly", status, NOW + 20 * DAY)], NOW);
      expect(src.status).toBe(status);
      expect(deriveEntitlement({ stripe: src }, NOW)).toEqual({ tier: "free", allAccessUntil: 0, plusUntil: 0 });
    }
  });

  it("a trial counts as access and is remembered (one trial per customer)", () => {
    const src = stripeSourceFromSubscriptions([sub("plus_yearly", "trialing", NOW + 10 * DAY, { trial_end: sec(NOW + 10 * DAY) })], NOW);
    expect(src.status).toBe("trialing");
    expect(src.trialEnd).toBeTruthy();
    expect(deriveEntitlement({ stripe: src }, NOW).tier).toBe("plus");
  });

  it("re-subscribed after a failed payment: the paid one is used", () => {
    const src = stripeSourceFromSubscriptions(
      [sub("plus_monthly", "past_due", NOW + 5 * DAY, { created: 1 }), sub("plus_monthly", "active", NOW + 30 * DAY, { id: "sub_new", created: 2 })],
      NOW
    );
    expect(src.subscriptionId).toBe("sub_new");
  });

  it("works with Stripe's newer API (period end on the item)", () => {
    const s = sub("plus_monthly", "active", NOW + DAY);
    delete s.current_period_end;
    s.items.data[0].current_period_end = sec(NOW + DAY);
    expect(stripeSourceFromSubscriptions([s], NOW).expiresAt).toBe(sec(NOW + DAY) * 1000);
  });

  it("subscriptions that aren't Train Solo plans are ignored", () => {
    expect(stripeSourceFromSubscriptions([{ id: "x", status: "active", items: { data: [{ price: { lookup_key: "other" } }] }, metadata: {} }], NOW)).toBe(null);
  });
});

describe("Apple (RevenueCat) → entitlement", () => {
  const iso = (ms) => new Date(ms).toISOString();
  it("an active All Access entitlement wins over Plus", () => {
    const src = appleSourceFromSubscriber(
      {
        entitlements: {
          plus: { expires_date: iso(NOW + DAY), product_identifier: "aa_yearly" },
          all_access: { expires_date: iso(NOW + DAY), product_identifier: "aa_yearly" },
        },
        subscriptions: { aa_yearly: { store: "app_store", period_type: "normal" } },
      },
      NOW
    );
    expect(src).toMatchObject({ tier: "all_access", status: "active", store: "app_store", willRenew: true });
  });

  it("a billing issue with no grace period: expired entitlement → Free", () => {
    const src = appleSourceFromSubscriber(
      {
        entitlements: { plus: { expires_date: iso(NOW - 1000), product_identifier: "plus_m" } },
        subscriptions: { plus_m: { billing_issues_detected_at: iso(NOW - 2000) } },
      },
      NOW
    );
    expect(src.status).toBe("billing_issue");
    expect(deriveEntitlement({ apple: src }, NOW).tier).toBe("free");
  });

  it("a refund ends access even before the period would have", () => {
    const src = appleSourceFromSubscriber(
      { entitlements: { all_access: { expires_date: iso(NOW + 20 * DAY), product_identifier: "aa" } }, subscriptions: { aa: { refunded_at: iso(NOW - 1) } } },
      NOW
    );
    expect(src.status).toBe("refunded");
    expect(deriveEntitlement({ apple: src }, NOW).allAccessUntil).toBe(0);
  });

  it("cancelled but still inside the paid period keeps access, won't renew", () => {
    const src = appleSourceFromSubscriber(
      { entitlements: { plus: { expires_date: iso(NOW + 3 * DAY), product_identifier: "p" } }, subscriptions: { p: { unsubscribe_detected_at: iso(NOW - DAY) } } },
      NOW
    );
    expect(src).toMatchObject({ status: "active", willRenew: false });
  });

  it("a trial shows as trialing", () => {
    const src = appleSourceFromSubscriber({ entitlements: { plus: { expires_date: iso(NOW + DAY), product_identifier: "p" } }, subscriptions: { p: { period_type: "trial" } } }, NOW);
    expect(src.status).toBe("trialing");
  });

  it("no entitlements at all → no Apple section", () => {
    expect(appleSourceFromSubscriber({ entitlements: {}, subscriptions: {} }, NOW)).toBe(null);
    expect(appleSourceFromSubscriber(undefined, NOW)).toBe(null);
  });
});

describe("both stores", () => {
  it("the best paid-up one decides; allAccessUntil only from All Access", () => {
    const d = deriveEntitlement(
      { stripe: { tier: "plus", status: "active", expiresAt: NOW + 5 * DAY }, apple: { tier: "all_access", status: "active", expiresAt: NOW + 2 * DAY } },
      NOW
    );
    expect(d).toEqual({ tier: "all_access", allAccessUntil: NOW + 2 * DAY, plusUntil: NOW + 5 * DAY });
  });
});

describe("website checkout decision", () => {
  const paid = (tier, plan, store = "stripe") => ({ sources: { [store]: { tier, plan, status: "active", expiresAt: NOW + DAY, subscriptionId: "sub_1" } } });
  it("new customer: checkout with the 10-day trial on yearly, none on monthly", () => {
    expect(checkoutDecision({}, "all_access_yearly", NOW)).toEqual({ action: "checkout", trialDays: 10 });
    expect(checkoutDecision({}, "all_access_monthly", NOW)).toEqual({ action: "checkout", trialDays: 0 });
  });
  it("no second trial", () => {
    expect(checkoutDecision({ trialUsed: true }, "plus_yearly", NOW)).toEqual({ action: "checkout", trialDays: 0 });
  });
  it("Plus on the website → All Access changes the existing subscription (no second one)", () => {
    expect(checkoutDecision(paid("plus", "plus_monthly"), "all_access_yearly", NOW)).toEqual({ action: "change", subscriptionId: "sub_1" });
  });
  it("same plan again: nothing to buy", () => {
    expect(checkoutDecision(paid("all_access", "all_access_yearly"), "all_access_yearly", NOW)).toEqual({ action: "already", store: "stripe" });
  });
  it("subscribed through Apple: never sold again on the website", () => {
    expect(checkoutDecision(paid("all_access", "aa", "apple"), "plus_monthly", NOW)).toEqual({ action: "already", store: "apple" });
    expect(checkoutDecision(paid("plus", "p", "apple"), "all_access_yearly", NOW)).toEqual({ action: "apple" });
  });
  it("a failed payment on the website: a new checkout is allowed (the old one is cancelled once it's paid)", () => {
    const ent = { sources: { stripe: { tier: "plus", plan: "plus_monthly", status: "past_due", expiresAt: NOW + DAY } }, trialUsed: true };
    expect(checkoutDecision(ent, "plus_monthly", NOW)).toEqual({ action: "checkout", trialDays: 0 });
  });
  it("unknown plan", () => {
    expect(checkoutDecision({}, "gold", NOW)).toEqual({ action: "invalid" });
  });
});
