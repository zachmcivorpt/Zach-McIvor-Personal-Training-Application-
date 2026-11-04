// Train Solo store check (#160): reads the LIVE Stripe and RevenueCat setup
// and compares it with what the code needs. Read-only — it never creates,
// changes or charges anything. Run from GitHub → Actions → "Train Solo store
// check" (uses the same repo secrets the functions deploy uses). Exits 1 if
// anything the subscriptions depend on is missing.
const { createRequire } = require("node:module");
const fnRequire = createRequire(require.resolve("../functions/package.json"));
const Stripe = fnRequire("stripe");
const { PLANS, lookupKey } = fnRequire("./soloSubscriptions.js");

const WEBHOOK_URL = "https://us-central1-zach-mcivor-pt-app.cloudfunctions.net/soloStripeWebhook";
// What soloStripeWebhook acts on (functions/index.js). paused/resumed are
// handled too but never happen (pausing isn't offered), so not required.
const REQUIRED_EVENTS = [
  "checkout.session.completed",
  "charge.refunded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
];
const PRODUCT_IDS = Object.keys(PLANS).map(lookupKey);

const lines = [];
let failures = 0;
const pass = (msg) => lines.push(`✅ ${msg}`);
const fail = (msg) => {
  failures++;
  lines.push(`❌ ${msg}`);
};
const note = (msg) => lines.push(`ℹ️ ${msg}`);

async function checkStripe() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!key.startsWith("sk_")) return fail("STRIPE_SECRET_KEY secret missing");
  note(`Stripe mode: ${key.startsWith("sk_live_") ? "LIVE" : "test"}`);
  // STRIPE_MOCK_PORT: local dry run against stripe-mock only.
  const stripe = process.env.STRIPE_MOCK_PORT ? new Stripe(key, { host: "localhost", port: Number(process.env.STRIPE_MOCK_PORT), protocol: "http" }) : new Stripe(key);

  // Webhook endpoint and its events.
  const endpoints = (await stripe.webhookEndpoints.list({ limit: 100 })).data.filter((e) => e.url === WEBHOOK_URL);
  if (!endpoints.length) fail(`no Stripe webhook endpoint for ${WEBHOOK_URL}`);
  for (const e of endpoints) {
    const events = new Set(e.enabled_events);
    const missing = events.has("*") ? [] : REQUIRED_EVENTS.filter((ev) => !events.has(ev));
    if (e.status !== "enabled") fail(`webhook ${e.id} is ${e.status}`);
    else if (missing.length) fail(`webhook ${e.id} is missing events: ${missing.join(", ")}`);
    else pass(`webhook ${e.id} enabled with all ${REQUIRED_EVENTS.length} events`);
  }

  // Prices: the checkout creates them on first use (ensurePrice); if they
  // exist they must match the plan.
  for (const [plan, p] of Object.entries(PLANS)) {
    const price = (await stripe.prices.list({ lookup_keys: [lookupKey(plan)], active: true, limit: 1 })).data[0];
    if (!price) {
      note(`${plan}: no price yet (created automatically on the first checkout)`);
      continue;
    }
    const ok = price.unit_amount === p.priceCents && price.currency === "aud" && price.recurring?.interval === p.interval;
    if (ok) pass(`${plan}: A$${(price.unit_amount / 100).toFixed(2)} / ${price.recurring.interval}`);
    else fail(`${plan}: price ${price.id} is ${price.unit_amount} ${price.currency}/${price.recurring?.interval}, expected ${p.priceCents} aud/${p.interval}`);
  }

  // Customer portal: cancel + card update on (cancellation is how a
  // website member cancels; the app switches plans itself, #159).
  const configs = (await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 })).data;
  const portal = configs[0];
  if (!portal) fail("no default Stripe customer portal configuration");
  else {
    const f = portal.features || {};
    if (f.subscription_cancel?.enabled) pass(`portal: cancel on (${f.subscription_cancel.mode})`);
    else fail("portal: cancelling is off — website members couldn't cancel");
    if (f.payment_method_update?.enabled) pass("portal: card update on");
    else fail("portal: card update is off");
    note(`portal: invoice history ${f.invoice_history?.enabled ? "on" : "off"}, plan switching ${f.subscription_update?.enabled ? "on" : "off"}`);
  }

  // Promotion code for testing (ROADMAP: APEXTEST).
  const promo = (await stripe.promotionCodes.list({ code: "APEXTEST", limit: 1 })).data[0];
  if (promo) note(`promotion code APEXTEST: ${promo.active ? "active" : "inactive"}, used ${promo.times_redeemed}/${promo.max_redemptions ?? "∞"}`);
  else note("promotion code APEXTEST not found");
}

async function checkRevenueCat() {
  // Offerings are read with the app's PUBLIC key (RevenueCat refuses secret
  // keys here) — the one shipped in the iPhone app, read from the repo.
  const swift = require("node:fs").readFileSync(require.resolve("../ios/ApexCoach/PurchasesBridge.swift"), "utf8");
  const key = swift.match(/revenueCatAPIKey\s*=\s*"(appl_[A-Za-z0-9]+)"/)?.[1];
  if (!key) return fail("RevenueCat public key not found in PurchasesBridge.swift");
  const res = await fetch("https://api.revenuecat.com/v1/subscribers/%24RCAnonymousID%3Aapexstorecheck/offerings", {
    headers: { Authorization: `Bearer ${key}`, "X-Platform": "ios", "Content-Type": "application/json" },
  });
  if (!res.ok) return fail(`RevenueCat offerings: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const current = (body.offerings || []).find((o) => o.identifier === body.current_offering_id);
  if (!current) return fail("RevenueCat: no current offering");
  const products = new Set((current.packages || []).map((p) => p.platform_product_identifier));
  const missing = PRODUCT_IDS.filter((id) => !products.has(id));
  if (missing.length) fail(`RevenueCat offering "${current.identifier}" is missing: ${missing.join(", ")}`);
  else pass(`RevenueCat offering "${current.identifier}" has all four products`);
}

// One account's subscription as RevenueCat sees it and what our server makes
// of it (#162: bought Plus, welcomed to All Access). Only when the workflow
// is run with a uid. Product ids, dates and flags only — no personal details.
async function checkSubscriber() {
  const uid = (process.env.SUBSCRIBER_UID || "").trim();
  if (!uid) return note("no account uid given — skipped");
  const key = process.env.REVENUECAT_SECRET_KEY || "";
  if (!key) return fail("REVENUECAT_SECRET_KEY secret missing");
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) return fail(`RevenueCat subscriber: HTTP ${res.status}`);
  const sub = (await res.json()).subscriber || {};
  for (const [id, s] of Object.entries(sub.subscriptions || {})) {
    note(`subscription ${id}: bought ${s.purchase_date}, expires ${s.expires_date}, ${s.period_type}, store ${s.store}${s.is_sandbox ? " (sandbox)" : ""}${s.unsubscribe_detected_at ? `, cancelled ${s.unsubscribe_detected_at}` : ""}${s.billing_issues_detected_at ? ", billing issue" : ""}${s.refunded_at ? ", refunded" : ""}${s.auto_resume_date ? `, resumes ${s.auto_resume_date}` : ""}`);
  }
  for (const [id, e] of Object.entries(sub.entitlements || {})) note(`entitlement ${id} → ${e.product_identifier}, expires ${e.expires_date}`);
  const { appleSourceFromSubscriber, deriveEntitlement } = fnRequire("./soloSubscriptions.js");
  const source = appleSourceFromSubscriber(sub);
  note(`our server reads: ${JSON.stringify(source)} → tier ${deriveEntitlement({ apple: source }).tier}`);
}

(async () => {
  for (const [name, fn] of [
    ["Stripe", checkStripe],
    ["RevenueCat", checkRevenueCat],
    ["One account", checkSubscriber],
  ]) {
    lines.push(`\n### ${name}`);
    try {
      await fn();
    } catch (err) {
      fail(`${name} check failed: ${err.message}`);
    }
  }
  const report = `## Train Solo store check\n${lines.join("\n")}\n\n${failures ? `**${failures} problem(s)**` : "**All good**"}\n`;
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) require("node:fs").appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  process.exit(failures ? 1 : 0);
})();
