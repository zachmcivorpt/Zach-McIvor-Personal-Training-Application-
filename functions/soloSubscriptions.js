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
// Owner rule: no paid access without payment. A failed renewal, a
// cancellation that has run out, a refund or an expiry all derive to Free
// immediately — Stripe's subscription status goes past_due/unpaid/canceled
// the moment a payment fails, and Apple (Billing Grace Period off) stops
// renewing the entitlement. Logs, sessions and history are never touched.
//
// Pure helpers are exported for tests (soloSubscriptions.test.js).

const PLANS = {
  plus_monthly: { tier: "plus", interval: "month", priceCents: 999, trialDays: 0, name: "Train Solo Plus" },
  plus_yearly: { tier: "plus", interval: "year", priceCents: 7999, trialDays: 10, name: "Train Solo Plus" },
  all_access_monthly: { tier: "all_access", interval: "month", priceCents: 2499, trialDays: 0, name: "Train Solo All Access" },
  all_access_yearly: { tier: "all_access", interval: "year", priceCents: 17999, trialDays: 10, name: "Train Solo All Access" },
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
      return {
        tier: PLANS[plan].tier,
        plan,
        status: sub.status,
        expiresAt: periodEndMs(sub),
        cancelAtPeriodEnd: !!sub.cancel_at_period_end,
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
  let best = null;
  for (const tier of ["all_access", "plus"]) {
    const ent = ents[tier];
    if (!ent) continue;
    const expiresAt = ent.expires_date ? Date.parse(ent.expires_date) : null; // null = lifetime / promotional without end
    const sub = subs[ent.product_identifier] || {};
    const refunded = !!sub.refunded_at;
    const paidUp = !refunded && (expiresAt == null || expiresAt > now);
    const source = {
      tier,
      status: refunded ? "refunded" : !paidUp ? (sub.billing_issues_detected_at ? "billing_issue" : "expired") : sub.period_type === "trial" ? "trialing" : "active",
      expiresAt,
      productId: ent.product_identifier || null,
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
  const source = stripeSourceFromSubscriptions(subs);
  await writeSource(db, uid, "stripe", source, { stripeCustomerId: customerId });
  return uid;
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
};
