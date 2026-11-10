import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PLANS, stripeSourceFromSubscriptions, appleSourceFromSubscriber, deriveEntitlement, checkoutDecision, planFromLookupKey, lookupKey } = require("./soloSubscriptions.js");

const solo = require("./soloSubscriptions.js");
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
  it("are the approved AUD prices, 7-day trial on yearly only", () => {
    expect(PLANS.plus_monthly.priceCents).toBe(999);
    expect(PLANS.plus_yearly.priceCents).toBe(7999);
    expect(PLANS.all_access_monthly.priceCents).toBe(2499);
    expect(PLANS.all_access_yearly.priceCents).toBe(17999);
    expect(PLANS.plus_yearly.trialDays).toBe(7);
    expect(PLANS.all_access_yearly.trialDays).toBe(7);
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

  it("a cancel from the portal keeps the plan until the period ends, then Free (#187, replaces #156)", () => {
    // Cancel at period end: paid up until the period end, won't renew.
    const atEnd = stripeSourceFromSubscriptions([sub("plus_monthly", "active", NOW + 9 * DAY, { cancel_at_period_end: true })], NOW);
    expect(atEnd).toMatchObject({ status: "active", cancelAtPeriodEnd: true, expiresAt: NOW + 9 * DAY });
    expect(deriveEntitlement({ stripe: atEnd }, NOW)).toEqual({ tier: "plus", allAccessUntil: 0, plusUntil: NOW + 9 * DAY });
    expect(deriveEntitlement({ stripe: atEnd }, NOW + 9 * DAY + 1).tier).toBe("free");
    // A cancel date before the period end: access ends on that date.
    const atDate = stripeSourceFromSubscriptions([sub("all_access_monthly", "active", NOW + 20 * DAY, { cancel_at: sec(NOW + 5 * DAY) })], NOW);
    expect(atDate.expiresAt).toBe(NOW + 5 * DAY);
    expect(deriveEntitlement({ stripe: atDate }, NOW)).toMatchObject({ tier: "all_access", allAccessUntil: NOW + 5 * DAY });
    expect(deriveEntitlement({ stripe: atDate }, NOW + 5 * DAY + 1).tier).toBe("free");
    // A cancelled trial runs to the trial's end.
    expect(deriveEntitlement({ stripe: stripeSourceFromSubscriptions([sub("all_access_yearly", "trialing", NOW + 5 * DAY, { cancel_at_period_end: true })], NOW) }, NOW).tier).toBe("all_access");
    // Not cancelled: unchanged.
    const live = stripeSourceFromSubscriptions([sub("plus_monthly", "active", NOW + 9 * DAY)], NOW);
    expect(live.cancelAt).toBe(null);
    expect(deriveEntitlement({ stripe: live }, NOW).tier).toBe("plus");
  });

  it("a portal cancel is no longer ended in Stripe at once (#187)", () => {
    const src = require("node:fs").readFileSync(new URL("./soloSubscriptions.js", import.meta.url), "utf8");
    const sync = src.slice(src.indexOf("async function syncStripeCustomer"), src.indexOf("async function priorCheckout"));
    expect(sync).not.toMatch(/cancel_at_period_end \|\| s\.cancel_at\)\) \{[\s\S]*subscriptions\.cancel/);
    expect(sync).not.toMatch(/immediate cancel failed/);
  });

  it("cancelled, then subscribed again: the new one is used", () => {
    const src = stripeSourceFromSubscriptions(
      [sub("plus_monthly", "canceled", NOW + 9 * DAY, { created: 1 }), sub("all_access_monthly", "active", NOW + 30 * DAY, { created: 2 })],
      NOW
    );
    expect(deriveEntitlement({ stripe: src }, NOW).tier).toBe("all_access");
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

  // #134: a sandbox purchase went through at Apple but the account stayed
  // Free; unlocking must not depend on the entitlement names in RevenueCat.
  it("an active apex_solo_ subscription unlocks even with no matching entitlement", () => {
    const src = appleSourceFromSubscriber(
      {
        entitlements: { Plus: { expires_date: iso(NOW + DAY), product_identifier: "apex_solo_plus_monthly" } },
        subscriptions: { apex_solo_plus_monthly: { expires_date: iso(NOW + DAY), store: "app_store", period_type: "normal", is_sandbox: true } },
      },
      NOW
    );
    expect(src).toMatchObject({ tier: "plus", status: "active", productId: "apex_solo_plus_monthly", willRenew: true });
    expect(deriveEntitlement({ apple: src }, NOW).tier).toBe("plus");
  });

  it("an All Access product id gives All Access; expired or refunded ones don't", () => {
    const sub = (exp, extra = {}) => ({ expires_date: iso(exp), ...extra });
    expect(appleSourceFromSubscriber({ subscriptions: { apex_solo_plus_yearly: sub(NOW + DAY), apex_solo_all_access_monthly: sub(NOW + DAY) } }, NOW).tier).toBe("all_access");
    const expired = appleSourceFromSubscriber({ subscriptions: { apex_solo_all_access_monthly: sub(NOW - DAY) } }, NOW);
    expect(deriveEntitlement({ apple: expired }, NOW).tier).toBe("free");
    const refunded = appleSourceFromSubscriber({ subscriptions: { apex_solo_plus_monthly: sub(NOW + DAY, { refunded_at: iso(NOW - 1) }) } }, NOW);
    expect(refunded.status).toBe("refunded");
    expect(appleSourceFromSubscriber({ subscriptions: { some_other_app_product: sub(NOW + DAY) } }, NOW)).toBe(null);
  });

  it("a refund ends access even before the period would have", () => {
    const src = appleSourceFromSubscriber(
      { entitlements: { all_access: { expires_date: iso(NOW + 20 * DAY), product_identifier: "aa" } }, subscriptions: { aa: { refunded_at: iso(NOW - 1) } } },
      NOW
    );
    expect(src.status).toBe("refunded");
    expect(deriveEntitlement({ apple: src }, NOW).allAccessUntil).toBe(0);
  });

  it("cancelled (auto-renew off) keeps the plan until it expires, then Free (#187, replaces #156)", () => {
    const src = appleSourceFromSubscriber(
      { entitlements: { all_access: { expires_date: iso(NOW + 20 * DAY), product_identifier: "aa" } }, subscriptions: { aa: { unsubscribe_detected_at: iso(NOW - 60000) } } },
      NOW
    );
    expect(src).toMatchObject({ status: "active", willRenew: false, expiresAt: NOW + 20 * DAY });
    expect(deriveEntitlement({ apple: src }, NOW)).toMatchObject({ tier: "all_access", allAccessUntil: NOW + 20 * DAY });
    // Expired: Free.
    const ended = appleSourceFromSubscriber(
      { entitlements: { all_access: { expires_date: iso(NOW - 1), product_identifier: "aa" } }, subscriptions: { aa: { unsubscribe_detected_at: iso(NOW - 30 * DAY) } } },
      NOW
    );
    expect(deriveEntitlement({ apple: ended }, NOW).tier).toBe("free");
    // A cancelled trial runs to the trial's end.
    const trial = appleSourceFromSubscriber({ entitlements: { plus: { expires_date: iso(NOW + DAY), product_identifier: "p" } }, subscriptions: { p: { period_type: "trial", unsubscribe_detected_at: iso(NOW - 1) } } }, NOW);
    expect(trial).toMatchObject({ status: "trialing", willRenew: false });
    expect(deriveEntitlement({ apple: trial }, NOW).tier).toBe("plus");
  });

  it("turned back on (RevenueCat clears unsubscribe_detected_at): access again", () => {
    const src = appleSourceFromSubscriber({ entitlements: { plus: { expires_date: iso(NOW + 3 * DAY), product_identifier: "p" } }, subscriptions: { p: {} } }, NOW);
    expect(deriveEntitlement({ apple: src }, NOW).tier).toBe("plus");
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
  it("new customer: checkout with the 7-day trial on yearly, none on monthly", () => {
    expect(checkoutDecision({}, "all_access_yearly", NOW)).toEqual({ action: "checkout", trialDays: 7 });
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

// #158: one payable checkout per account and purpose.
describe("priorCheckout / rememberCheckout", () => {
  function fakeDb(initial = {}) {
    const store = { ...initial };
    return {
      store,
      collection: () => ({
        doc: (uid) => ({
          get: async () => ({ exists: !!store[uid], data: () => store[uid] }),
          set: async (data, opts) => {
            store[uid] = opts?.merge ? { ...(store[uid] || {}), ...data } : data;
          },
        }),
      }),
    };
  }
  function fakeStripe(sessions) {
    const expired = [];
    return {
      expired,
      checkout: {
        sessions: {
          retrieve: async (id) => {
            if (!sessions[id]) throw new Error("No such checkout session");
            return { id, status: sessions[id] };
          },
          expire: async (id) => {
            expired.push(id);
            sessions[id] = "expired";
          },
        },
      },
    };
  }

  it("no earlier checkout: go ahead", async () => {
    const r = await solo.priorCheckout(fakeDb(), fakeStripe({}), "u1", "subscription");
    expect(r).toEqual({ alreadyPaid: false });
  });
  it("an earlier one still open is expired, so only the new one can be paid", async () => {
    const stripe = fakeStripe({ cs_old: "open" });
    const r = await solo.priorCheckout(fakeDb({ u1: { subscription: "cs_old" } }), stripe, "u1", "subscription");
    expect(r.alreadyPaid).toBe(false);
    expect(stripe.expired).toEqual(["cs_old"]);
  });
  it("an earlier one already paid (webhook not landed yet) stops a second charge", async () => {
    const stripe = fakeStripe({ cs_old: "complete" });
    const r = await solo.priorCheckout(fakeDb({ u1: { program_p1: "cs_old" } }), stripe, "u1", "program_p1");
    expect(r.alreadyPaid).toBe(true);
    expect(stripe.expired).toEqual([]);
  });
  it("slots are separate: a program checkout doesn't touch the subscription one", async () => {
    const stripe = fakeStripe({ cs_sub: "open" });
    await solo.priorCheckout(fakeDb({ u1: { subscription: "cs_sub" } }), stripe, "u1", "program_p1");
    expect(stripe.expired).toEqual([]);
  });
  it("an expired or unknown earlier one is ignored", async () => {
    expect((await solo.priorCheckout(fakeDb({ u1: { subscription: "cs_x" } }), fakeStripe({ cs_x: "expired" }), "u1", "subscription")).alreadyPaid).toBe(false);
    expect((await solo.priorCheckout(fakeDb({ u1: { subscription: "gone" } }), fakeStripe({}), "u1", "subscription")).alreadyPaid).toBe(false);
  });
  it("remembers the latest checkout per slot", async () => {
    const db = fakeDb();
    await solo.rememberCheckout(db, "u1", "subscription", "cs_1");
    await solo.rememberCheckout(db, "u1", "program_p1", "cs_2");
    expect(db.store.u1).toMatchObject({ subscription: "cs_1", program_p1: "cs_2" });
  });
});

// #181: back from a website checkout, the plan unlocks from the checkout
// itself (a first-time subscriber has no stripeCustomerId until the webhook).
describe("customerFromCheckout", () => {
  const stripeWith = (session) => ({ checkout: { sessions: { retrieve: async (id) => (session ? { id, ...session } : Promise.reject(new Error("No such session"))) } } });
  const paid = { mode: "subscription", status: "complete", client_reference_id: "u1", customer: "cus_new" };
  it("gives the customer of this account's completed subscription checkout", async () => {
    expect(await solo.customerFromCheckout(stripeWith(paid), "cs_test_1", "u1")).toBe("cus_new");
    expect(await solo.customerFromCheckout(stripeWith({ ...paid, client_reference_id: null, metadata: { soloUserId: "u1" }, customer: { id: "cus_obj" } }), "cs_test_1", "u1")).toBe("cus_obj");
  });
  it("never another account's checkout", async () => {
    expect(await solo.customerFromCheckout(stripeWith(paid), "cs_test_1", "someone_else")).toBe(null);
  });
  it("not an unpaid, single-program or unknown checkout, nor a malformed id", async () => {
    expect(await solo.customerFromCheckout(stripeWith({ ...paid, status: "open" }), "cs_test_1", "u1")).toBe(null);
    expect(await solo.customerFromCheckout(stripeWith({ ...paid, mode: "payment" }), "cs_test_1", "u1")).toBe(null);
    expect(await solo.customerFromCheckout(stripeWith(null), "cs_test_1", "u1")).toBe(null);
    expect(await solo.customerFromCheckout(stripeWith(paid), "{CHECKOUT_SESSION_ID}", "u1")).toBe(null);
    expect(await solo.customerFromCheckout(stripeWith(paid), "", "u1")).toBe(null);
  });
});

// #183: Plus / All Access from Apple, as RevenueCat reports sandbox purchases,
// upgrades and downgrades.
describe("Apple tiers: upgrade, downgrade, entitlement lag (#183)", () => {
  const iso = (ms) => new Date(ms).toISOString();
  it("an All Access purchase reported only under the 'plus' entitlement is All Access", () => {
    const src = appleSourceFromSubscriber(
      {
        entitlements: { plus: { expires_date: iso(NOW + DAY), product_identifier: "apex_solo_all_access_monthly" } },
        subscriptions: { apex_solo_all_access_monthly: { store: "app_store", period_type: "normal", expires_date: iso(NOW + DAY), is_sandbox: true } },
      },
      NOW
    );
    expect(src).toMatchObject({ tier: "all_access", status: "active", willRenew: true });
  });
  it("Plus upgraded to All Access: the old Plus (ended by Apple) doesn't hold the member at Plus", () => {
    const src = appleSourceFromSubscriber(
      {
        entitlements: { plus: { expires_date: iso(NOW + DAY), product_identifier: "apex_solo_plus_monthly" } },
        subscriptions: {
          apex_solo_plus_monthly: { store: "app_store", period_type: "normal", expires_date: iso(NOW + DAY), unsubscribe_detected_at: iso(NOW - 1000) },
          apex_solo_all_access_monthly: { store: "app_store", period_type: "normal", expires_date: iso(NOW + DAY) },
        },
      },
      NOW
    );
    expect(src).toMatchObject({ tier: "all_access", status: "active", productId: "apex_solo_all_access_monthly" });
  });
  it("All Access downgraded to Plus at renewal: Plus from then on", () => {
    const src = appleSourceFromSubscriber(
      {
        entitlements: {
          all_access: { expires_date: iso(NOW - 1000), product_identifier: "apex_solo_all_access_monthly" },
          plus: { expires_date: iso(NOW + DAY), product_identifier: "apex_solo_plus_monthly" },
        },
        subscriptions: {
          apex_solo_all_access_monthly: { store: "app_store", expires_date: iso(NOW - 1000) },
          apex_solo_plus_monthly: { store: "app_store", period_type: "normal", expires_date: iso(NOW + DAY) },
        },
      },
      NOW
    );
    expect(src).toMatchObject({ tier: "plus", status: "active" });
  });
});

// #185: after cancelling on the website, subscribing again said "You're
// already on this plan": the last checkout was paid, and that was all
// priorCheckout looked at.
describe("subscribing again after a cancel (#185)", () => {
  function fakeDb(initial = {}) {
    const store = { ...initial };
    return { collection: () => ({ doc: (uid) => ({ get: async () => ({ exists: !!store[uid], data: () => store[uid] }), set: async () => {} }) }) };
  }
  function fakeStripe(sub) {
    return {
      checkout: { sessions: { retrieve: async (id) => ({ id, status: "complete", mode: "subscription", subscription: "sub_1" }), expire: async () => {} } },
      subscriptions: {
        retrieve: async () => {
          if (sub instanceof Error) throw sub;
          return sub;
        },
      },
    };
  }
  const prior = (sub) => solo.priorCheckout(fakeDb({ u1: { subscription: "cs_paid" } }), fakeStripe(sub), "u1", "subscription");

  it("its subscription cancelled (ended): a new checkout is allowed", async () => {
    expect(await prior({ status: "canceled" })).toEqual({ alreadyPaid: false });
  });
  it("cancelled at period end / a cancel date not processed yet: allowed", async () => {
    expect(await prior({ status: "active", cancel_at_period_end: true })).toEqual({ alreadyPaid: false });
    expect(await prior({ status: "active", cancel_at: 1900000000 })).toEqual({ alreadyPaid: false });
  });
  it("a failed payment (past_due / unpaid, Free for us): allowed, so a new card brings them back", async () => {
    expect(await prior({ status: "past_due" })).toEqual({ alreadyPaid: false });
    expect(await prior({ status: "unpaid" })).toEqual({ alreadyPaid: false });
  });
  it("still paid up (the webhook just hasn't landed): still no second charge", async () => {
    expect(await prior({ status: "active" })).toEqual({ alreadyPaid: true });
    expect(await prior({ status: "trialing" })).toEqual({ alreadyPaid: true });
  });
  it("Stripe can't say: no second checkout (safe)", async () => {
    expect(await prior(new Error("network"))).toEqual({ alreadyPaid: true });
  });
});

// #186: single programs bought on the website. Ownership is written only
// from a PAID Stripe checkout, once, and never reset by repeats.
describe("recordProgramPurchase (#186)", () => {
  function fakeDb(initial = {}) {
    const docs = { ...initial };
    const ref = (id) => ({ id });
    return {
      docs,
      collection: (name) => ({ doc: (id) => ref(`${name}/${id}`) }),
      runTransaction: async (fn) =>
        fn({
          get: async (r) => ({ exists: r.id in docs, data: () => docs[r.id] }),
          set: (r, data) => {
            docs[r.id] = data;
          },
        }),
    };
  }
  const paid = (over = {}) => ({
    id: "cs_1",
    mode: "payment",
    payment_status: "paid",
    payment_intent: "pi_1",
    amount_total: 7499,
    metadata: { soloUserId: "u1", programId: "p1" },
    ...over,
  });

  it("a paid checkout makes the program the buyer's (Free or Plus alike)", async () => {
    const db = fakeDb();
    expect(await solo.recordProgramPurchase(db, paid())).toEqual({ recorded: "new" });
    expect(db.docs["soloPurchases/u1_p1"]).toMatchObject({ soloUserId: "u1", programId: "p1", refunded: false, stripePaymentIntentId: "pi_1", amountPaidCents: 7499 });
  });
  it("a repeated or late webhook never resets the member's start date or creates a second purchase", async () => {
    const db = fakeDb({ "soloPurchases/u1_p1": { soloUserId: "u1", programId: "p1", refunded: false, startDate: "2026-11-02", purchasedAt: 1 } });
    expect(await solo.recordProgramPurchase(db, paid())).toEqual({ recorded: "existing" });
    expect(await solo.recordProgramPurchase(db, paid())).toEqual({ recorded: "existing" });
    expect(db.docs["soloPurchases/u1_p1"]).toMatchObject({ startDate: "2026-11-02", purchasedAt: 1 });
    expect(Object.keys(db.docs)).toEqual(["soloPurchases/u1_p1"]);
  });
  it("buying again after a refund restores it", async () => {
    const db = fakeDb({ "soloPurchases/u1_p1": { soloUserId: "u1", programId: "p1", refunded: true, startDate: "2026-10-01" } });
    expect(await solo.recordProgramPurchase(db, paid({ id: "cs_2", payment_intent: "pi_2" }))).toEqual({ recorded: "restored" });
    expect(db.docs["soloPurchases/u1_p1"]).toMatchObject({ refunded: false, stripeCheckoutSessionId: "cs_2" });
  });
  it("an unpaid, failed or non-program checkout writes nothing", async () => {
    const db = fakeDb();
    expect(await solo.recordProgramPurchase(db, paid({ payment_status: "unpaid" }))).toEqual({ skipped: "not paid" });
    expect(await solo.recordProgramPurchase(db, paid({ mode: "subscription" }))).toEqual({ skipped: "not a program checkout" });
    expect(await solo.recordProgramPurchase(db, paid({ metadata: {} }))).toEqual({ skipped: "not a program checkout" });
    expect(await solo.recordProgramPurchase(db, null)).toEqual({ skipped: "not a program checkout" });
    expect(db.docs).toEqual({});
  });
  it("All Access members are never sold a program; a lapsed one can buy", () => {
    expect(solo.hasAllAccessNow({ allAccessUntil: NOW + DAY }, NOW)).toBe(true);
    expect(solo.hasAllAccessNow({ allAccessUntil: NOW - 1 }, NOW)).toBe(false);
    expect(solo.hasAllAccessNow({}, NOW)).toBe(false);
  });
});

describe("program checkout server wiring (#186)", () => {
  const src = require("node:fs").readFileSync(new URL("./index.js", import.meta.url), "utf8");
  const fn = (name) => src.slice(src.indexOf(`exports.${name} =`), src.indexOf("\nexports.", src.indexOf(`exports.${name} =`) + 10));
  it("still sold after Go live, except to All Access members", () => {
    const f = fn("createSoloCheckoutSession");
    expect(f).not.toMatch(/Programs are now part of All Access/);
    expect(f).toMatch(/hasAllAccessNow\(await soloEntitlementOf\(uid\)\)\) return \{ includedWithAllAccess: true \}/);
    expect(f).toMatch(/mode: "payment"/);
    expect(f).toMatch(/success_url: `\$\{returnOrigin\}\/solo\/program\/\$\{encodeURIComponent\(programId\)\}\?checkout=success&session_id=\{CHECKOUT_SESSION_ID\}`/);
  });
  it("the return check: the caller's own checkout, fetched from Stripe, recorded only if paid", () => {
    const f = fn("confirmSoloProgramPurchase");
    expect(f).toMatch(/checkout\.sessions\.retrieve\(sessionId\)/);
    expect(f).toMatch(/session\?\.metadata\?\.soloUserId !== uid\) throw/);
    expect(f).toMatch(/recordProgramPurchase\(db, session\)/);
  });
  it("the webhook records through the same safe function (no more merge resetting startDate)", () => {
    const hook = fn("soloStripeWebhook");
    expect(hook).toMatch(/recordProgramPurchase\(db, session\)/);
    expect(hook).not.toMatch(/startDate: null/);
  });
});

// #191: single programs bought in the iPhone app (App Store non-consumables
// apex_solo_program_<programId>, listed by RevenueCat as non_subscriptions).
describe("Apple program purchases (#191)", () => {
  const sub = {
    non_subscriptions: {
      apex_solo_program_p1: [{ id: "rc1", store: "app_store", store_transaction_id: "2000001", purchase_date: "2026-11-07T10:00:00Z" }],
      apex_solo_program_bad$id: [{ id: "x", store: "app_store", purchase_date: "2026-11-07T10:00:00Z" }],
      some_other_product: [{ id: "y", store: "app_store", purchase_date: "2026-11-07T10:00:00Z" }],
      apex_solo_program_p2: [{ id: "z", store: "play_store", purchase_date: "2026-11-07T10:00:00Z" }],
    },
  };
  it("reads only this app's program products from the App Store", () => {
    expect(solo.applePurchasesFromSubscriber(sub)).toEqual([
      { programId: "p1", productId: "apex_solo_program_p1", transactionId: "2000001", purchasedAt: Date.parse("2026-11-07T10:00:00Z") },
    ]);
    expect(solo.applePurchasesFromSubscriber({})).toEqual([]);
  });

  function fakeDb({ programs = ["p1"], purchases = {} } = {}) {
    const docs = { ...purchases };
    return {
      docs,
      collection: (name) => ({
        doc: (id) => ({
          id,
          path: `${name}/${id}`,
          get: async () => ({ exists: name === "soloPrograms" ? programs.includes(id) : `${name}/${id}` in docs, data: () => docs[`${name}/${id}`] }),
        }),
      }),
      runTransaction: async (fn) =>
        fn({
          get: async (r) => ({ exists: r.path in docs, data: () => docs[r.path] }),
          set: (r, data) => {
            docs[r.path] = data;
          },
        }),
    };
  }
  it("records the program as the member's, server-side, once", async () => {
    const db = fakeDb();
    await solo.recordApplePrograms(db, "u1", sub);
    expect(db.docs["soloPurchases/u1_p1"]).toMatchObject({ soloUserId: "u1", programId: "p1", refunded: false, source: "apple", appleTransactionId: "2000001", startDate: null });
    // Every later sync leaves an existing purchase alone (start date kept).
    db.docs["soloPurchases/u1_p1"].startDate = "2026-11-08";
    await solo.recordApplePrograms(db, "u1", sub);
    expect(db.docs["soloPurchases/u1_p1"].startDate).toBe("2026-11-08");
  });
  it("a program already bought on the website is untouched; an unknown program is skipped", async () => {
    const db = fakeDb({ programs: [], purchases: {} });
    await solo.recordApplePrograms(db, "u1", sub);
    expect(db.docs).toEqual({});
    const db2 = fakeDb({ purchases: { "soloPurchases/u1_p1": { soloUserId: "u1", programId: "p1", refunded: false, stripePaymentIntentId: "pi_1" } } });
    await solo.recordApplePrograms(db2, "u1", sub);
    expect(db2.docs["soloPurchases/u1_p1"]).toEqual({ soloUserId: "u1", programId: "p1", refunded: false, stripePaymentIntentId: "pi_1" });
  });
  it("never takes a program away when it's missing from RevenueCat's answer", async () => {
    const db = fakeDb({ purchases: { "soloPurchases/u1_p1": { soloUserId: "u1", programId: "p1", refunded: false, source: "apple" } } });
    await solo.recordApplePrograms(db, "u1", { non_subscriptions: {} });
    expect(db.docs["soloPurchases/u1_p1"].refunded).toBe(false);
  });
  it("syncApple records program purchases on every sync (open, Restore, RevenueCat's webhook)", () => {
    const src = require("node:fs").readFileSync(new URL("./soloSubscriptions.js", import.meta.url), "utf8");
    const fn = src.slice(src.indexOf("async function syncApple"), src.indexOf("// Single programs bought in the iPhone app"));
    expect(fn).toMatch(/await recordApplePrograms\(db, uid, subscriber\)/);
  });
});

// #214: Stripe sends charge.refunded for partial refunds too, and the webhook
// marked the bought program refunded (locked) on any of them.
describe("program refunds: only a full refund takes the program away (#214)", () => {
  it("a partial refund keeps the program; a full one doesn't", () => {
    expect(solo.chargeFullyRefunded({ amount: 7499, amount_refunded: 1000, refunded: false })).toBe(false);
    expect(solo.chargeFullyRefunded({ amount: 7499, amount_refunded: 7499, refunded: true })).toBe(true);
    expect(solo.chargeFullyRefunded({ amount: 7499, amount_refunded: 7499 })).toBe(true);
    expect(solo.chargeFullyRefunded({ amount: 0, amount_refunded: 0, refunded: false })).toBe(false);
    expect(solo.chargeFullyRefunded(null)).toBe(false);
  });

  it("the webhook checks it before marking a purchase refunded", () => {
    const src = require("node:fs").readFileSync(new URL("./index.js", import.meta.url), "utf8");
    const handler = src.slice(src.indexOf('event.type === "charge.refunded"'), src.indexOf("refunded: true, refundedAt"));
    expect(handler).toMatch(/solo\.chargeFullyRefunded\(charge\)/);
  });
});
