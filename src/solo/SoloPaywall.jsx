import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { MEASURE_BLUE, MEASURE_BLUE_SOFT } from "../theme";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES } from "./SoloThemeContext";
import { BottomSheet, PrimaryButton } from "../components/ui";
import { PLANS, TIER_LABELS, formatPlanPrice, activeStore, planRenewal, renewalText } from "./soloAccess";
import { inIosApp } from "./appShell";
import { SoloPurchaseStage, SoloWelcomeScreen } from "./SoloPurchaseScreens";
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
    backgroundColor: dark ? "rgba(16,16,18,0.38)" : "rgba(255,255,255,0.3)",
    backdropFilter: dark ? "blur(30px) saturate(170%)" : "blur(30px) saturate(190%) brightness(1.12)",
    WebkitBackdropFilter: dark ? "blur(30px) saturate(170%)" : "blur(30px) saturate(190%) brightness(1.12)",
    boxShadow: dark ? "inset 0 1px 0 rgba(255,255,255,0.1)" : "inset 0 1px 0 rgba(255,255,255,0.85)",
  };
}

// A plan tile: a thinner pane of glass on the sheet's glass.
function planGlass(dark, selected) {
  return {
    backgroundColor: dark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.3)",
    border: `${selected ? 1.5 : 1}px solid ${selected ? MEASURE_BLUE : dark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.7)"}`,
    boxShadow: selected ? `0 0 0 4px ${MEASURE_BLUE_SOFT}` : dark ? "none" : "0 1px 0 rgba(20,19,15,0.04)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
  };
}

const TIER_FEATURES = {
  all_access: ["Every program in the catalogue", "New programs as they're released", "Everything in Plus"],
  plus: ["Suggested weights for every set", "Build your own multi-week programs", "Full stats, PRs and Apple Health on Progress", "Recovery add-ons and unlimited saved sessions"],
};

// After Apple's purchase sheet the iPhone app's page can be left undrawn: a
// black screen that still takes taps, so a tap on the invisible Subscribe
// button started a second purchase (#134). The page's code still runs, so
// once the sheet answers the page reloads itself (drawn again, instantly
// from the saved copy) and shows the outcome after the reload.
const PURCHASE_OUTCOME_KEY = "apexSoloPurchaseOutcome";
export const paywallPage = { reload: () => window.location.reload() };
let PURCHASE_RECHECK_MS = 2500;
export function setPurchaseRecheckMsForTests(ms) {
  PURCHASE_RECHECK_MS = ms;
}

function rememberPurchaseOutcome(outcome) {
  try {
    sessionStorage.setItem(PURCHASE_OUTCOME_KEY, JSON.stringify({ ...outcome, at: Date.now() }));
  } catch {
    // No storage: the reload still redraws the page, and the purchase is
    // picked up by the sync on open (#133).
  }
}

function takePurchaseOutcome() {
  try {
    const raw = sessionStorage.getItem(PURCHASE_OUTCOME_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PURCHASE_OUTCOME_KEY);
    const outcome = JSON.parse(raw);
    return outcome && Date.now() - (outcome.at || 0) < 10 * 60 * 1000 ? outcome : null;
  } catch {
    return null;
  }
}

export function SoloPaywallProvider({ children }) {
  const [request, setRequest] = useState(null); // { reason, tier, notice }
  const openPaywall = useCallback(
    (opts = {}) => setRequest({ reason: opts.reason || null, tier: opts.tier || "all_access", notice: opts.notice || "" }),
    []
  );
  const value = useMemo(() => ({ openPaywall }), [openPaywall]);
  const { soloAuthUser, refreshSoloEntitlement, soloEntitlement } = useSoloApp();
  const [outcome] = useState(takePurchaseOutcome);
  const signedIn = !!soloAuthUser;
  // After the reload: "confirming" while the server is asked, then the
  // welcome screen for the plan it confirms (#136).
  const [confirming, setConfirming] = useState(() => !!outcome?.ok);
  const [welcomeTier, setWelcomeTier] = useState(null);

  // The result of a purchase made just before the reload above.
  useEffect(() => {
    if (!outcome || outcome.cancelled || !signedIn) return;
    if (outcome.error) {
      openPaywall({ tier: outcome.tier, notice: outcome.error });
      return;
    }
    let stopped = false;
    const notReached = "Apple confirmed your purchase, but it hasn't reached your account yet. Try Restore purchases in a minute.";
    const ask = () => refreshSoloEntitlement().then((r) => r?.tier).catch(() => null);
    (async () => {
      let got = await ask();
      // RevenueCat can take a moment to see a brand-new purchase.
      if (!got || got === "free") {
        await new Promise((r) => setTimeout(r, PURCHASE_RECHECK_MS));
        if (stopped) return;
        got = await ask();
      }
      if (stopped) return;
      setConfirming(false);
      if (got && got !== "free") setWelcomeTier(got);
      else openPaywall({ tier: outcome.tier, notice: notReached });
    })();
    return () => {
      stopped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  // Never leave the confirming screen up (e.g. signed out meanwhile).
  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 20000);
    return () => clearTimeout(id);
  }, [confirming]);

  const renewal = renewalText(planRenewal(soloEntitlement));
  return (
    <PaywallCtx.Provider value={value}>
      {children}
      {confirming && <SoloPurchaseStage title="Confirming your membership" detail="One moment." />}
      {welcomeTier && (
        <SoloWelcomeScreen
          tier={welcomeTier}
          renewal={renewal ? `${renewal} · App Store` : ""}
          onDone={() => setWelcomeTier(null)}
        />
      )}
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
  // Apple's sheet is about to open / open: the membership sheet gives way
  // to a calm full-screen "Opening the App Store" (#136).
  const [openingStore, setOpeningStore] = useState(false);
  const [message, setMessage] = useState("");
  const [storeProducts, setStoreProducts] = useState(null);
  // Why the App Store returned no subscriptions (e.g. the Paid Apps
  // Agreement isn't active yet), shown under the disabled button instead of
  // leaving a silent grey button. Cleared on each open so it retries.
  const [storeError, setStoreError] = useState("");
  const [showStoreError, setShowStoreError] = useState(false);

  useEffect(() => {
    if (!open) return;
    // A Plus member can only move up, so All Access is always preselected for them.
    setTier(request.tier === "plus" && soloTier !== "plus" ? "plus" : "all_access");
    setInterval_("year");
    setMessage(request.notice || "");
    if (nativeIap && !(storeProducts && storeProducts.length)) {
      setStoreError("");
      setShowStoreError(false);
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
    if (iosApp) {
      // Apple's free trial is only for someone who has never subscribed in
      // the group. A Plus member (or anyone who has had a plan) upgrading
      // gets no trial, whatever the store's eligibility check says (#139).
      if (trialUsed || store || soloEntitlement?.sources?.apple || soloEntitlement?.sources?.stripe) return 0;
      return (storeProducts || []).find((x) => x.plan === planKey)?.trialDays || 0;
    }
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
    let reloading = false;
    try {
      if (iosApp) {
        // Whatever Apple's sheet answered, reload so the page is drawn
        // again, and show the outcome after (#134).
        let outcome;
        setOpeningStore(true);
        // Let that screen paint (the iPhone app pictures it behind Apple's
        // sheet, #135) before Apple's sheet opens.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        try {
          await purchasePlan(plan, soloAuthUser?.uid);
          outcome = { ok: true, tier };
        } catch (err) {
          outcome = err?.cancelled ? { cancelled: true, tier } : { error: err?.message || "Something went wrong — please try again.", tier };
        }
        rememberPurchaseOutcome(outcome);
        reloading = true; // stays busy: no second tap before the reload
        paywallPage.reload();
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
      if (!reloading) setBusy(false);
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
    <>
    {openingStore && <SoloPurchaseStage title="Opening the App Store" detail="Complete your purchase in Apple's window." />}
    <BottomSheet open={open && !openingStore} onClose={onClose} title={soloTier === "free" ? "Train Solo Membership" : "Your membership"} dark={dark} surface={paywallSurface(dark)} backdropClassName="bg-black/10">
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
                    {(p || (iosApp && storeProducts === null)) && (
                    <div className="flex items-baseline gap-1.5 mt-1.5 min-h-[34px]">
                      {p ? (
                        <>
                          <p className="text-[30px] leading-none font-semibold tracking-[-0.03em] tabular-nums">{p}</p>
                          <p className="text-xs font-medium" style={{ color: t.textMuted }}>
                            / {per}
                          </p>
                        </>
                      ) : (
                        <p className="text-[30px] leading-none font-semibold" style={{ color: t.textFaint }}>–</p>
                      )}
                    </div>
                    )}
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
                <div className="text-[11px] text-center mt-2.5 leading-relaxed" style={{ color: t.textMuted }}>
                  <p>
                    Subscriptions aren't available right now. Please try again later.{" "}
                    <button type="button" onClick={() => setShowStoreError((v) => !v)} className="underline underline-offset-2 font-semibold">
                      {showStoreError ? "Hide details" : "Details"}
                    </button>
                  </p>
                  {showStoreError && <p className="mt-1.5 break-words" style={{ color: t.textFaint }}>{storeError}</p>}
                </div>
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
    </>
  );
}
