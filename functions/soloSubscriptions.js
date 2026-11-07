// Train Solo subscriptions — Free / Plus / All Access (ROADMAP.txt step 2).
//
// Two stores sell the same two plans:
//  - Website: Stripe subscriptions (this file's checkout + the existing
//    soloStripeWebhook in index.js, which hands subscription events here).
//  - iPhone app: Apple In-App Purchase through RevenueCat (1.0.4's native
//    bridge). RevenueCat calls soloRevenueCatWebhook; we then ask
//    RevenueCat's API for the customer's current entitlements rather than
//    trusting the event's own fields.
//
// Each store writes its own section of soloEntitlements/{uid}:
//   sources.stripe / sources.apple = { tier, status, expiresAt, ... }
// and the doc's derived fields are recomputed from both every time:
//   tier            best paid-up tier ("free" | "plus" | "all_access")
//   allAccessUntil  end of the paid All Access period, 0 if none — what
//                   firestore.rules' hasAllAccess() checks before letting a
//                   customer read a program they haven't bought
//   plusUntil       same for Plus-or-better
//
// Owner rule: no paid access without payment, and cancelling ends it
// straight away (#156): a cancelled subscription (Stripe: cancel at period
// end / a cancel date, which we then end in Stripe at once; Apple:
// RevenueCat's unsubscribe_detected_at) is Free the moment it's cancelled,
// not at the end of the period. A failed renewal, a refund or an expiry
// also derive to Free immediately — Stripe's subscription status goes past_due/unpaid/canceled
// the moment a payment fails, and Apple (Billing Grace Period off) stops
// renewing the entitlement. Logs, sessions and history are never touched.
//
// Pure helpers are exported for tests (soloSubscriptions.test.js).

const PLANS = {
  plus_monthly: { tier: "plus", interval: "month", priceCents: 999, trialDays: 0, name: "Train Solo Plus" },
  plus_yearly: { tier: "plus", interval: "year", priceCents: 7999, trialDays: 7, name: "Train Solo Plus" },
  all_access_monthly: { tier: "all_access", interval: "month", priceCents: 2499, trialDays: 0, name: "Train Solo All Access" },
  all_access_yearly: { tier: "all_access", interval: "year", priceCents: 17999, trialDays: 7, name: "Train Solo All Access" },
};
const RANK = { free: 0, plus: 1, all_access: 2 };
const ACTIVE_STRIPE = new Set(["active", "trialing"]);

const lookupKey = (plan) => `apex_solo_${plan}`;
function planFromLookupKey(key) {
  const plan = typeof key === "string" && key.startsWith("apex_solo_") ? key.slice("apex_solo_".length) : null;
  return plan && PLANS[plan] ? plan : null;
}

function periodEndMs(sub) {
  const end = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
  return end ? end * 1000 : null;
}

function planOfSubscription(sub) {
  const item = sub.items?.data?.[0];
  return planFromLookupKey(item?.price?.lookup_key) || (PLANS[sub.metadata?.plan] ? sub.metadata.plan : null);
}

// The customer's Stripe section from all their Stripe subscriptions: the
// best one that's paid up, else the most recent one (so the app can say
// "your payment failed" rather than just showing Free).
function stripeSourceFromSubscriptions(subs, now = Date.now()) {
  const rows = (subs || [])
    .map((sub) => {
      const plan = planOfSubscription(sub);
      if (!plan) return null;
      // Cancelled (cancel at period end / a cancel date): still paid up
      // until it ends (owner decision 2026-11-07, #187 — replaces #156's
      // "ends straight away"); it just won't renew.
      const periodEnd = periodEndMs(sub);
      const cancelAtMs = sub.cancel_at ? sub.cancel_at * 1000 : null;
      return {
        tier: PLANS[plan].tier,
        plan,
        status: sub.status,
        expiresAt: cancelAtMs && (periodEnd == null || cancelAtMs < periodEnd) ? cancelAtMs : periodEnd,
        cancelAtPeriodEnd: !!sub.cancel_at_period_end,
        cancelAt: sub.cancel_at ? sub.cancel_at * 1000 : null,
        trialEnd: sub.trial_end ? sub.trial_end * 1000 : null,
        subscriptionId: sub.id,
        created: sub.created || 0,
      };
    })
    .filter(Boolean);
  if (rows.length === 0) return null;
  const paid = rows.filter((r) => ACTIVE_STRIPE.has(r.status) && (r.expiresAt == null || r.expiresAt > now));
  const pick = (paid.length ? paid : rows).sort((a, b) => RANK[b.tier] - RANK[a.tier] || b.created - a.created)[0];
  const { created, ...source } = pick;
  return source;
}

// The customer's Apple section from RevenueCat's GET /v1/subscribers
// response. Entitlement ids in RevenueCat must be "plus" and "all_access"
// (an All Access product grants both).
function appleSourceFromSubscriber(subscriber, now = Date.now()) {
  const ents = subscriber?.entitlements || {};
  const subs = subscriber?.subscriptions || {};
  // RevenueCat's entitlements ("plus", "all_access") first; then our own
  // App Store product ids (apex_solo_<plan>) straight from the
  // subscriptions, so a purchase still unlocks if the entitlements are
  // named or attached differently in RevenueCat's dashboard (#134).
  const candidates = [];
  for (const tier of ["all_access", "plus"]) {
    if (ents[tier]) candidates.push({ tier, productId: ents[tier].product_identifier, expires: ents[tier].expires_date });
  }
  for (const tier of ["all_access", "plus"]) {
    for (const [productId, s] of Object.entries(subs)) {
      const plan = planFromLookupKey(productId);
      // An auto-renewing subscription always has an end date; skip one without.
      if (plan && PLANS[plan].tier === tier && s?.expires_date) candidates.push({ tier, productId, expires: s?.expires_date });
    }
  }
  // Highest tier first (#183): RevenueCat's "plus" entitlement covers all
  // four products, so an All Access purchase it reports only there (the
  // all_access entitlement missing or late) was read as Plus before its own
  // All Access product was looked at. Each tier is also never below its
  // product's own tier.
  for (const c of candidates) {
    const plan = planFromLookupKey(c.productId || "");
    if (plan && RANK[PLANS[plan].tier] > RANK[c.tier]) c.tier = PLANS[plan].tier;
  }
  candidates.sort((a, b) => RANK[b.tier] - RANK[a.tier]);
  let best = null;
  for (const { tier, productId, expires } of candidates) {
    const expiresAt = expires ? Date.parse(expires) : null; // null = lifetime / promotional without end
    const sub = subs[productId] || {};
    const refunded = !!sub.refunded_at;
    const notExpired = expiresAt == null || expiresAt > now;
    // Cancelled (auto-renew off): still paid up until it expires (#187 —
    // replaces #156's "ends straight away"); willRenew false says so.
    const paidUp = !refunded && notExpired;
    const source = {
      tier,
      status: refunded ? "refunded" : !paidUp ? (sub.billing_issues_detected_at ? "billing_issue" : "expired") : sub.period_type === "trial" ? "trialing" : "active",
      expiresAt,
      productId: productId || null,
      store: sub.store || null,
      willRenew: !!(paidUp && !sub.unsubscribe_detected_at && !sub.billing_issues_detected_at),
    };
    if (paidUp) return source;
    if (!best) best = source;
  }
  return best;
}

function sourcePaidUp(source, now) {
  if (!source || !RANK[source.tier]) return false;
  if (source.status !== "active" && source.status !== "trialing") return false;
  return source.expiresAt == null || source.expiresAt > now;
}

// Derived fields for the doc. "until" for a source with no end date
// (lifetime/promotional) is far in the future.
const FOREVER = 8640000000000000;
function deriveEntitlement(sources, now = Date.now()) {
  let tier = "free";
  let allAccessUntil = 0;
  let plusUntil = 0;
  for (const source of Object.values(sources || {})) {
    if (!sourcePaidUp(source, now)) continue;
    const until = source.expiresAt == null ? FOREVER : source.expiresAt;
    if (RANK[source.tier] > RANK[tier]) tier = source.tier;
    if (source.tier === "all_access") allAccessUntil = Math.max(allAccessUntil, until);
    plusUntil = Math.max(plusUntil, until);
  }
  return { tier, allAccessUntil, plusUntil };
}

// What a website checkout for `plan` should do given the customer's current
// entitlement: start a checkout (with the trial if eligible), upgrade the
// existing Stripe subscription, or stop because they already have it /
// it's managed through Apple.
function checkoutDecision(entitlement, plan, now = Date.now()) {
  const wanted = PLANS[plan];
  if (!wanted) return { action: "invalid" };
  const sources = entitlement?.sources || {};
  const apple = sourcePaidUp(sources.apple, now) ? sources.apple : null;
  const stripe = sourcePaidUp(sources.stripe, now) ? sources.stripe : null;
  if (apple && RANK[apple.tier] >= RANK[wanted.tier]) return { action: "already", store: "apple" };
  if (apple) return { action: "apple" }; // a lower Apple plan is changed in the App Store, not here
  if (stripe && stripe.plan === plan) return { action: "already", store: "stripe" };
  if (stripe) return { action: "change", subscriptionId: stripe.subscriptionId };
  const trialDays = wanted.trialDays > 0 && !entitlement?.trialUsed ? wanted.trialDays : 0;
  return { action: "checkout", trialDays };
}

// ---------------------------------------------------------------------
// Firestore/Stripe/RevenueCat glue (not unit-tested; exercised end to end
// in Stripe test mode and RevenueCat sandbox — see REGRESSION_TESTS.md).

async function writeSource(db, uid, storeKey, source, extra = {}) {
  const ref = db.collection("soloEntitlements").doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? snap.data() : {};
    const sources = { ...(prev.sources || {}) };
    if (source) sources[storeKey] = source;
    else delete sources[storeKey];
    const derived = deriveEntitlement(sources);
    const trialUsed = !!(prev.trialUsed || extra.trialUsed || (source && source.trialEnd));
    tx.set(ref, { ...prev, ...extra, sources, ...derived, trialUsed, uid, updatedAt: Date.now() });
  });
}

const priceIdCache = {};
async function ensurePrice(stripe, plan) {
  if (priceIdCache[plan]) return priceIdCache[plan];
  const key = lookupKey(plan);
  const found = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
  let price = found.data[0];
  if (!price) {
    const p = PLANS[plan];
    const productKey = `apex_solo_${p.tier}`;
    const products = await stripe.products.search({ query: `metadata['apex_key']:'${productKey}'` }).catch(() => ({ data: [] }));
    const product = products.data[0] || (await stripe.products.create({ name: p.name, metadata: { apex_key: productKey } }));
    price = await stripe.prices.create({
      product: product.id,
      currency: "aud",
      unit_amount: p.priceCents,
      recurring: { interval: p.interval },
      lookup_key: key,
    });
  }
  priceIdCache[plan] = price.id;
  return price.id;
}

// Re-reads every Stripe subscription for this customer and rewrites the
// Stripe section. Called from webhooks and after checkout/changes.
async function syncStripeCustomer(db, stripe, customerId, uidHint) {
  if (!customerId) return null;
  const list = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20, expand: ["data.items.data.price"] });
  const subs = list.data.filter((s) => !uidHint || !s.metadata?.soloUserId || s.metadata.soloUserId === uidHint);
  const uid = uidHint || subs.find((s) => s.metadata?.soloUserId)?.metadata.soloUserId;
  if (!uid) return null;
  // Once a subscription is paid up, an older one whose payment failed (they
  // re-subscribed instead of fixing the card) is cancelled, so Stripe's
  // retries can never charge them twice.
  if (subs.some((s) => ACTIVE_STRIPE.has(s.status))) {
    for (const s of subs) {
      if (["past_due", "unpaid", "incomplete"].includes(s.status)) {
        await stripe.subscriptions.cancel(s.id).catch((err) => console.error("cancel stale subscription failed", s.id, err.message));
      }
    }
  }
  // Cancelled from the portal (cancel at period end / a cancel date): left
  // to run to the end of the period they paid for (#187). Stripe ends it
  // then by itself, and its webhook makes the account Free.
  const source = stripeSourceFromSubscriptions(subs);
  await writeSource(db, uid, "stripe", source, { stripeCustomerId: customerId });
  return uid;
}

// One open Stripe checkout per account and purpose (#158). Two open
// checkouts (two tabs, an old one reopened from history) could both be
// paid: two subscriptions, or the same program bought twice. The id of the
// last checkout started is kept in soloCheckoutSessions/{uid} (server-only:
// firestore.rules has no match for it, so no app can read or write it).
// Before a new one: if the last one was already paid (its webhook hasn't
// landed yet) say so instead of charging again; if it's still open, expire
// it so it can't be paid. `slot` is "subscription" or "program_<id>".
async function priorCheckout(db, stripe, uid, slot) {
  const ref = db.collection("soloCheckoutSessions").doc(uid);
  const snap = await ref.get();
  const oldId = snap.exists ? snap.data()?.[slot] : null;
  if (!oldId) return { alreadyPaid: false };
  let old = null;
  try {
    old = await stripe.checkout.sessions.retrieve(oldId);
  } catch {
    return { alreadyPaid: false }; // gone: nothing to stop
  }
  if (old.status === "complete") {
    // A paid subscription checkout blocks a new one only while its
    // subscription is still paid up and not cancelled (#185) — the case
    // this check exists for: paid, but Stripe's webhook hasn't reached us.
    // Cancelled (ended at once, #156; or cancel at period end / a cancel
    // date not yet processed), a failed payment (past_due / unpaid — Free
    // for us, and a new card is how they come back) or never completed:
    // buying again must work. It used to say "You're already on this plan"
    // for good after a cancel on the website.
    if (old.mode === "subscription" && old.subscription) {
      const subId = typeof old.subscription === "string" ? old.subscription : old.subscription.id;
      try {
        const sub = await stripe.subscriptions.retrieve(subId);
        const live = ACTIVE_STRIPE.has(sub?.status) && !sub?.cancel_at_period_end && !sub?.cancel_at;
        if (!live) return { alreadyPaid: false };
      } catch {
        // Can't tell: stay safe and don't open a second checkout.
      }
    }
    return { alreadyPaid: true };
  }
  if (old.status === "open") await stripe.checkout.sessions.expire(oldId).catch(() => {});
  return { alreadyPaid: false };
}
async function rememberCheckout(db, uid, slot, sessionId) {
  await db.collection("soloCheckoutSessions").doc(uid).set({ [slot]: sessionId, updatedAt: Date.now() }, { merge: true });
}

// Back from a website checkout (/solo/home?subscribed=<plan>&session_id=…,
// #181): the member's plan is unlocked from the checkout itself, straight
// away, instead of waiting for Stripe's webhook. A first-time subscriber has
// no stripeCustomerId on their entitlement until that webhook lands, so the
// sync couldn't find them. The checkout must belong to this account (its
// client_reference_id / metadata), be a subscription checkout and be
// complete; anything else gives null (the webhook still does the rest).
async function customerFromCheckout(stripe, sessionId, uid) {
  if (!sessionId || typeof sessionId !== "string" || !/^cs_[A-Za-z0-9_]+$/.test(sessionId) || !uid) return null;
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return null;
  }
  if (!session || session.mode !== "subscription" || session.status !== "complete") return null;
  const owner = session.client_reference_id || session.metadata?.soloUserId || null;
  if (owner !== uid) return null;
  const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
  return customer || null;
}

function revenueCatConfigured(env = process.env) {
  return !!(env.REVENUECAT_SECRET_KEY && env.REVENUECAT_SECRET_KEY !== "not-configured-yet");
}

async function fetchRevenueCatSubscriber(uid, env = process.env) {
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${env.REVENUECAT_SECRET_KEY}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`RevenueCat ${res.status}`);
  const body = await res.json();
  return body.subscriber;
}

async function syncApple(db, uid) {
  if (!revenueCatConfigured()) return;
  const profile = await db.collection("soloUsers").doc(uid).get();
  if (!profile.exists) return; // not a Train Solo account (anonymous id, typo, deleted account)
  const subscriber = await fetchRevenueCatSubscriber(uid);
  await writeSource(db, uid, "apple", appleSourceFromSubscriber(subscriber));
}

module.exports = {
  PLANS,
  lookupKey,
  planFromLookupKey,
  stripeSourceFromSubscriptions,
  appleSourceFromSubscriber,
  deriveEntitlement,
  checkoutDecision,
  writeSource,
  ensurePrice,
  syncStripeCustomer,
  syncApple,
  revenueCatConfigured,
  priorCheckout,
  rememberCheckout,
  customerFromCheckout,
};
