// Train Solo's subscription tiers (ROADMAP.txt step 2): what each tier
// unlocks, and the one function every screen asks before showing a paid
// feature. Pure — no Firestore/React — so the rules are tested once here.
//
//   Free        create sessions and log; up to 3 saved sessions.
//   Plus        + suggested weights, own multi-week programs, full stats,
//               Apple Health on Progress, recovery add-ons, unlimited
//               saved sessions.
//   All Access  + every catalogue program.
//
// The tier comes from soloEntitlements/{uid}, written only by the server
// (functions/soloSubscriptions.js) from Stripe (website) and Apple (via
// RevenueCat). Each store has its own section; the tier is the best one
// still paid up. A failed payment, a cancellation that's reached its end,
// or an expiry date in the past all read as Free — checked again here
// against the phone's clock so a missed server update can't leave paid
// access on.
//
// Nothing is gated until launch: settings/soloMonetisation { live: true }
// (or the account being on its testUids list, for TestFlight testing).
// Until then every feature that's free today stays free and programs are
// still bought one at a time.

export const TIERS = ["free", "plus", "all_access"];
const RANK = { free: 0, plus: 1, all_access: 2 };

export const TIER_LABELS = { free: "Free", plus: "Plus", all_access: "All Access" };

// What each paid feature needs.
export const FEATURE_TIER = {
  suggestedWeights: "plus",
  programBuilder: "plus",
  fullStats: "plus",
  appleHealthProgress: "plus",
  recoveryAddons: "plus",
  unlimitedSessions: "plus",
  catalogue: "all_access",
};

export const FREE_SAVED_SESSIONS = 3;

// Prices shown on the website paywall (AUD, GST included). Inside the iPhone
// app the paywall shows Apple's own localised prices from the store instead
// (src/lib/purchases.js), never these.
export const PLANS = {
  plus_monthly: { tier: "plus", interval: "month", priceCents: 999, label: "Plus", trialDays: 0 },
  plus_yearly: { tier: "plus", interval: "year", priceCents: 7999, label: "Plus", trialDays: 10 },
  all_access_monthly: { tier: "all_access", interval: "month", priceCents: 2499, label: "All Access", trialDays: 0 },
  all_access_yearly: { tier: "all_access", interval: "year", priceCents: 17999, label: "All Access", trialDays: 10 },
};

export function tierAtLeast(tier, needed) {
  return (RANK[tier] ?? 0) >= (RANK[needed] ?? 0);
}

// One store's section is paid up when it names a real tier, its status is
// active or trialing, and its expiry (when it has one) hasn't passed.
export function sourceActive(source, now = Date.now()) {
  if (!source || !RANK[source.tier]) return false;
  if (source.status && source.status !== "active" && source.status !== "trialing") return false;
  if (source.expiresAt != null && !(Number(source.expiresAt) > now)) return false;
  return true;
}

// The customer's tier right now from their soloEntitlements doc.
export function tierFromEntitlement(entitlement, now = Date.now()) {
  let best = "free";
  for (const source of Object.values(entitlement?.sources || {})) {
    if (sourceActive(source, now) && RANK[source.tier] > RANK[best]) best = source.tier;
  }
  return best;
}

// Which store the paid tier comes from ("stripe" | "apple"), or null.
export function activeStore(entitlement, now = Date.now()) {
  const tier = tierFromEntitlement(entitlement, now);
  if (tier === "free") return null;
  const hit = Object.entries(entitlement?.sources || {}).find(([, s]) => s.tier === tier && sourceActive(s, now));
  return hit ? hit[0] : null;
}

// When the current paid plan renews or ends, so Profile and the paywall can
// say "Renews 12 Dec" or "Won't renew · ends 12 Dec" after a cancel.
// Stripe: cancelAtPeriodEnd / cancelAt (a cancel set from the portal).
// Apple: willRenew (RevenueCat's unsubscribe_detected_at). null when Free
// or the plan has no end date.
export function planRenewal(entitlement, now = Date.now()) {
  const store = activeStore(entitlement, now);
  if (!store) return null;
  const s = entitlement.sources[store];
  const expiresAt = s.expiresAt != null ? Number(s.expiresAt) : null;
  const cancelAt = Number(s.cancelAt) > now ? Number(s.cancelAt) : null;
  const date = cancelAt && (!expiresAt || cancelAt < expiresAt) ? cancelAt : expiresAt;
  if (!date) return null;
  const willRenew = store === "apple" ? s.willRenew !== false : !s.cancelAtPeriodEnd && !cancelAt;
  return { date, willRenew, trial: s.status === "trialing", store };
}

export function formatRenewalDate(ms, now = Date.now()) {
  const d = new Date(ms);
  const opts = { day: "numeric", month: "short" };
  if (d.getFullYear() !== new Date(now).getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-AU", opts);
}

// "Renews 12 Dec", "Won't renew · ends 12 Dec", "Trial · first payment
// 12 Dec", "Trial · ends 12 Dec". Never a price (3.1.1 inside the app).
export function renewalText(renewal, now = Date.now()) {
  if (!renewal) return "";
  const when = formatRenewalDate(renewal.date, now);
  if (renewal.trial) return renewal.willRenew ? `Free trial · first payment ${when}` : `Free trial · ends ${when}`;
  return renewal.willRenew ? `Renews ${when}` : `Won't renew · ends ${when}`;
}

export function gatesLive(monetisation, uid) {
  if (monetisation?.live === true) return true;
  return !!uid && Array.isArray(monetisation?.testUids) && monetisation.testUids.includes(uid);
}

// The question every screen asks. Before launch everything that's free today
// stays open, except the catalogue (still bought per program until then).
export function canUse(feature, { tier = "free", live = false } = {}) {
  const needed = FEATURE_TIER[feature];
  if (!needed) return true;
  if (!live) return feature !== "catalogue";
  return tierAtLeast(tier, needed);
}

export function savedSessionLimit(access) {
  return canUse("unlimitedSessions", access) ? Infinity : FREE_SAVED_SESSIONS;
}

// Saving a NEW session is allowed while under the limit; editing an existing
// one always is (a lapsed Plus customer keeps every session they made, and
// can keep using and editing them — only adding more waits for an upgrade or
// deleting some).
export function canSaveNewSession(savedCount, access) {
  return savedCount < savedSessionLimit(access);
}

export function formatPlanPrice(plan) {
  const dollars = plan.priceCents / 100;
  return `A$${dollars.toFixed(plan.priceCents % 100 === 0 ? 0 : 2)}`;
}
