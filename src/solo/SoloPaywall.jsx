import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { MEASURE_BLUE, MEASURE_BLUE_SOFT } from "../theme";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES } from "./SoloThemeContext";
import { BottomSheet, PrimaryButton } from "../components/ui";
import { PLANS, TIER_LABELS, formatPlanPrice, activeStore, planRenewal, renewalText } from "./soloAccess";
import { inIosApp } from "./appShell";
import { inAppPurchasesAvailable, loadStoreProducts, purchasePlan, restorePurchases, manageAppleSubscription } from "../lib/purchases";

// The Train Solo paywall (ROADMAP.txt step 2): Plus and All Access, yearly
// first with its 7-day free trial (Apple: 1 week). Any screen opens it with
// useSoloPaywall().openPaywall({ reason, tier }).
//
// Where it buys:
//  - Website: Stripe (functions createSoloSubscriptionCheckout).
//  - iPhone app 1.0.4+: Apple In-App Purchase (src/lib/purchases.js), with
//    the App Store's own prices. Never a website price, link or mention
//    inside the app (Apple 3.1.1).
//  - iPhone app before 1.0.4: no way to buy, so it says to update the app.
// Apple's subscription rules are covered here: price and period on every
// option, trial terms, auto-renewal wording, Restore purchases, and links to
// the Terms of Service and Privacy Policy.

const PaywallCtx = createContext({ openPaywall: () => {} });
export const useSoloPaywall = () => useContext(PaywallCtx);

// The membership sheet's own glass: lighter and clearer than the standard
// Solo sheet (soloSheetGlass) so the page shows through, with a stronger
// blur and saturation so text stays readable.
function paywallSurface(dark) {
  return {
    backgroundColor: dark ? "rgba(18,18,20,0.58)" : "rgba(246,245,242,0.6)",
    backdropFilter: "blur(40px) saturate(180%)",
    WebkitBackdropFilter: "blur(40px) saturate(180%)",
    boxShadow: dark ? "inset 0 1px 0 rgba(255,255,255,0.08)" : "inset 0 1px 0 rgba(255,255,255,0.7)",
  };
}

// A plan tile: a thinner pane of glass on the sheet's glass.
function planGlass(dark, selected) {
  return {
    backgroundColor: dark ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.4)",
    border: `${selected ? 1.5 : 1}px solid ${selected ? MEASURE_BLUE : dark ? "rgba(255,255,255,0.1)" : "rgba(20,19,15,0.08)"}`,
    boxShadow: selected ? `0 0 0 4px ${MEASURE_BLUE_SOFT}` : "none",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
  };
}

const TIER_FEATURES = {
  all_access: ["Every program in the catalogue", "New programs as they're released", "Everything in Plus"],
  plus: ["Suggested weights for every set", "Build your own multi-week programs", "Full stats, PRs and Apple Health on Progress", "Recovery add-ons and unlimited saved sessions"],
};

export function SoloPaywallProvider({ children }) {
  const [request, setRequest] = useState(null); // { reason, tier }
  const openPaywall = useCallback((opts = {}) => setRequest({ reason: opts.reason || null, tier: opts.tier || "all_access" }), []);
  const value = useMemo(() => ({ openPaywall }), [openPaywall]);
  return (
    <PaywallCtx.Provider value={value}>
      {children}
      <SoloPaywallSheet request={request} onClose={() => setRequest(null)} />
    </PaywallCtx.Provider>
  );
}

function SoloPaywallSheet({ request, onClose }) {
  const { soloTier, soloEntitlement, startSoloSubscription, refreshSoloEntitlement, openSoloBillingPortal, soloAuthUser } = useSoloApp();
  const { dark } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const open = !!request;
  const iosApp = inIosApp();
  const nativeIap = iosApp && inAppPurchasesAvailable();
  const [interval, setInterval_] = useState("year");
  const [tier, setTier] = useState("all_access");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [storeProducts, setStoreProducts] = useState(null);
  // Why the App Store returned no subscriptions (e.g. the Paid Apps
  // Agreement isn't active yet), shown under the disabled button instead of
  // leaving a silent grey button. Cleared on each open so it retries.
  const [storeError, setStoreError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTier(request.tier === "plus" ? "plus" : "all_access");
    setInterval_("year");
    setMessage("");
    if (nativeIap && !(storeProducts && storeProducts.length)) {
      setStoreError("");
      loadStoreProducts()
        .then((list) => {
          const products = Array.isArray(list) ? list : [];
          setStoreProducts(products);
          if (!products.length) setStoreError("The App Store didn't return any subscriptions.");
        })
        .catch((err) => {
          setStoreProducts([]);
          setStoreError(err?.message || "Couldn't reach the App Store.");
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const plan = `${tier}_${interval === "year" ? "yearly" : "monthly"}`;
  const store = activeStore(soloEntitlement);
  const renewal = planRenewal(soloEntitlement);
  const trialUsed = !!soloEntitlement?.trialUsed;

  // Price text for a plan: the App Store's in the app, ours on the website.
  function priceOf(planKey) {
    if (iosApp) {
      const p = (storeProducts || []).find((x) => x.plan === planKey);
      return p?.price || null;
    }
    return formatPlanPrice(PLANS[planKey]);
  }
  function trialDaysOf(planKey) {
    if (iosApp) return (storeProducts || []).find((x) => x.plan === planKey)?.trialDays || 0;
    // A paid-up subscriber's upgrade changes their current subscription
    // (charged pro rata, functions checkoutDecision "change") — no trial.
    return trialUsed || store ? 0 : PLANS[planKey].trialDays;
  }
  const per = interval === "year" ? "year" : "month";
  const trialDays = trialDaysOf(plan);
  const price = priceOf(plan);

  async function buy() {
    setBusy(true);
    setMessage("");
    try {
      if (iosApp) {
        await purchasePlan(plan, soloAuthUser?.uid);
        await refreshSoloEntitlement().catch(() => {});
        setMessage("You're in — welcome to " + TIER_LABELS[tier] + ".");
        setTimeout(onClose, 1200);
        return;
      }
      const result = await startSoloSubscription(plan);
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      if (result?.changed) {
        setMessage(`Done — you're now on ${TIER_LABELS[tier]}.`);
        setTimeout(onClose, 1500);
      } else if (result?.already) {
        setMessage(result.already === "apple" ? "You already have this through the App Store." : "You're already on this plan.");
      } else if (result?.manageInApple) {
        setMessage("Your subscription is with the App Store — change your plan in the APEX iPhone app.");
      }
    } catch (err) {
      if (!err?.cancelled) setMessage(err?.message || "Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    setMessage("");
    try {
      await restorePurchases();
      const { tier: restored } = (await refreshSoloEntitlement()) || {};
      setMessage(restored && restored !== "free" ? `Restored — you have ${TIER_LABELS[restored]}.` : "No subscription found for this Apple ID.");
    } catch (err) {
      setMessage(err?.message || "Couldn't restore — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function manage() {
    try {
      if (store === "apple") {
        if (nativeIap) await manageAppleSubscription();
        else setMessage("Manage it in iPhone Settings → your name → Subscriptions.");
        return;
      }
      const { url } = await openSoloBillingPortal();
      if (url) window.location.href = url;
    } catch (err) {
      setMessage(err?.message || "Couldn't open subscription settings.");
    }
  }

  const alreadyThis = soloTier === "all_access" || (soloTier === "plus" && tier === "plus");
  // Inside the app, a website subscriber manages it on the website — said
  // without a link or price (3.1.1).
  const canManageHere = store === "stripe" ? !iosApp : store === "apple";

  return (
    <BottomSheet open={open} onClose={onClose} title={soloTier === "free" ? "Train Solo Membership" : "Your membership"} dark={dark} surface={paywallSurface(dark)}>
      <div style={{ color: t.text }}>
        {request?.reason && (
          <p className="text-sm mb-4 leading-relaxed" style={{ color: t.textMuted }}>
            {request.reason}
          </p>
        )}

        {soloTier !== "free" && (
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="min-w-0">
              <p className="text-sm">
                You have <span className="font-bold">{TIER_LABELS[soloTier]}</span>
                {store === "apple" ? " through the App Store" : store === "stripe" && !iosApp ? " through the website" : ""}.
              </p>
              {renewal && (
                <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
                  {renewalText(renewal)}
                  {!renewal.willRenew && " — you keep everything until then."}
                </p>
              )}
            </div>
            {canManageHere && (
              <button type="button" onClick={manage} className="text-xs font-bold underline underline-offset-2 shrink-0">
                Manage
              </button>
            )}
          </div>
        )}

        {soloTier !== "all_access" && (
          <>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-full mb-5" style={{ ...planGlass(dark, false), boxShadow: "none" }} role="tablist">
              {[
                ["year", "Yearly"],
                ["month", "Monthly"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={interval === value}
                  onClick={() => setInterval_(value)}
                  className="text-[11px] font-bold tracking-[0.08em] uppercase py-2 rounded-full transition-colors"
                  style={interval === value ? { backgroundColor: t.text, color: t.bg } : { color: t.textMuted }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {["all_access", "plus"].map((key) => {
                if (soloTier === "plus" && key === "plus") return null;
                const planKey = `${key}_${interval === "year" ? "yearly" : "monthly"}`;
                const p = priceOf(planKey);
                const days = trialDaysOf(planKey);
                const selected = tier === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTier(key)}
                    aria-pressed={selected}
                    className="w-full text-left rounded-[20px] px-5 pt-4 pb-4 transition-shadow"
                    style={planGlass(dark, selected)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-bold tracking-[0.14em] uppercase" style={{ color: selected ? MEASURE_BLUE : t.textMuted }}>
                        {TIER_LABELS[key]}
                      </p>
                      <span
                        aria-hidden="true"
                        className="w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0"
                        style={selected ? { backgroundColor: MEASURE_BLUE } : { border: `1.5px solid ${t.textFaint}` }}
                      >
                        {selected && <Check size={11} strokeWidth={3} color="#FFFFFF" />}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5 mt-1.5 min-h-[34px]">
                      {p ? (
                        <>
                          <p className="text-[30px] leading-none font-semibold tracking-[-0.03em] tabular-nums">{p}</p>
                          <p className="text-xs font-medium" style={{ color: t.textMuted }}>
                            / {per}
                          </p>
                        </>
                      ) : (
                        iosApp && storeProducts === null && <p className="text-[30px] leading-none font-semibold" style={{ color: t.textFaint }}>–</p>
                      )}
                    </div>
                    {days > 0 && (
                      <p className="text-xs font-semibold mt-1.5" style={{ color: MEASURE_BLUE }}>
                        {days} days free
                      </p>
                    )}
                    <ul className="mt-3 pt-3 space-y-1.5 border-t" style={{ borderColor: dark ? "rgba(255,255,255,0.08)" : "rgba(20,19,15,0.07)" }}>
                      {TIER_FEATURES[key].map((f) => (
                        <li key={f} className="flex items-start gap-2.5 text-[13px] leading-snug" style={{ color: t.textMuted }}>
                          <Check size={14} className="shrink-0 mt-[2px]" color={MEASURE_BLUE} />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            {message && <p className="text-sm mt-4">{message}</p>}

            <div className="mt-5">
              {iosApp && !nativeIap ? (
                <p className="text-sm text-center font-semibold py-3 rounded-full" style={planGlass(dark, false)}>
                  Update the APEX app to subscribe
                </p>
              ) : alreadyThis ? null : (
                <PrimaryButton dark={dark} className="w-full" onClick={buy} disabled={busy || (iosApp && !price)}>
                  {busy ? "ONE MOMENT…" : trialDays > 0 ? `START ${trialDays}-DAY FREE TRIAL` : `SUBSCRIBE TO ${TIER_LABELS[tier].toUpperCase()}`}
                </PrimaryButton>
              )}
              {nativeIap && !price && storeError && !alreadyThis && (
                <p className="text-[11px] text-center mt-2.5 leading-relaxed" style={{ color: t.textMuted }}>
                  Subscriptions aren't available right now. Please try again later. ({storeError})
                </p>
              )}
              {price && (
                <p className="text-[11px] text-center mt-2.5 leading-relaxed" style={{ color: t.textMuted }}>
                  {trialDays > 0 ? `${trialDays} days free, then ${price} a ${per}. ` : `${price} a ${per}. `}
                  Renews automatically until you cancel; cancel at least 24 hours before it renews to avoid the next charge.
                  {iosApp ? " Manage or cancel in iPhone Settings." : " Manage or cancel any time from Profile."}
                </p>
              )}
            </div>
          </>
        )}

        {soloTier === "all_access" && message && <p className="text-sm mt-2">{message}</p>}

        <div className="flex items-center justify-center gap-4 mt-4 text-[11px] font-semibold" style={{ color: t.textMuted }}>
          {nativeIap && (
            <button type="button" onClick={restore} disabled={busy} className="underline underline-offset-2">
              Restore purchases
            </button>
          )}
          <Link to="/legal/terms-of-service" className="underline underline-offset-2" onClick={onClose}>
            Terms of Service
          </Link>
          <Link to="/legal/privacy-policy" className="underline underline-offset-2" onClick={onClose}>
            Privacy Policy
          </Link>
        </div>
      </div>
    </BottomSheet>
  );
}
