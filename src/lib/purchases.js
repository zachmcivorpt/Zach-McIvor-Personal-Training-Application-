// In-app purchases for Train Solo — the iOS App Store build from 1.0.4 on.
// Apple requires subscriptions bought inside an iPhone app to use In-App
// Purchase, so the app's paywall talks to native code
// (ios/ApexCoach/PurchasesBridge.swift, RevenueCat's SDK) through the
// apexPurchases message handler and gets answers back through
// window.__apexNativePurchases.receive — the same request/response pattern
// as Apple Health (src/lib/appleHealth.js).
//
// Builds before 1.0.4 have no apexPurchases handler: the paywall then asks
// the customer to update the app, never pointing anywhere else to buy
// (Apple 3.1.1). Browsers use the website's Stripe checkout instead.
//
// The native side identifies the customer to RevenueCat by their Train
// Solo uid, so whatever they buy lands on the right account; the server
// (functions syncSoloEntitlement / soloRevenueCatWebhook) then writes the
// entitlement every screen reads. Nothing here unlocks anything by itself.

const pending = new Map();
let seq = 0;

if (typeof window !== "undefined") {
  window.__apexNativePurchases = {
    receive(msg) {
      const p = pending.get(msg?.id);
      if (!p) return;
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) {
        const err = new Error(msg.error);
        err.cancelled = !!msg.cancelled;
        p.reject(err);
      } else p.resolve(msg.result);
    },
  };
}

export function inAppPurchasesAvailable() {
  return typeof window !== "undefined" && !!window.webkit?.messageHandlers?.apexPurchases;
}

function ask(action, extra = {}, timeoutMs = 60 * 1000) {
  if (!inAppPurchasesAvailable()) return Promise.reject(new Error("Update the APEX app to subscribe."));
  return new Promise((resolve, reject) => {
    const id = `p${++seq}`;
    const timer = setTimeout(() => {
      if (pending.delete(id)) reject(new Error("The App Store didn't respond — please try again."));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    window.webkit.messageHandlers.apexPurchases.postMessage({ id, action, ...extra });
  });
}

// Tells RevenueCat which Train Solo account this is (call on sign-in).
export function identifyPurchaser(uid) {
  return ask("identify", { uid });
}

// Signing out of Train Solo: the next purchase on this phone can't land on
// the previous account.
export function forgetPurchaser() {
  return ask("logout");
}

// The App Store's own products and localised prices:
// [{ plan, productId, price: "A$179.99", period: "year", trialDays }]
export function loadStoreProducts() {
  return ask("offerings");
}

// Shows Apple's purchase sheet. Resolves once Apple confirms (the server is
// then asked to re-read the entitlement); rejects with err.cancelled when
// the customer backs out.
export function purchasePlan(plan, uid) {
  return ask("purchase", { plan, uid }, 10 * 60 * 1000);
}

export function restorePurchases() {
  return ask("restore", {}, 2 * 60 * 1000);
}

// Opens iPhone Settings' subscription management for this app.
export function manageAppleSubscription() {
  return ask("manage");
}
