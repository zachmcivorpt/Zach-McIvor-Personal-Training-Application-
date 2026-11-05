import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { MEASURE_BLUE, MEASURE_BLUE_SOFT } from "../theme";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES, soloClearSheetGlass } from "./SoloThemeContext";
import { BottomSheet, PrimaryButton } from "../components/ui";
import { PLANS, TIER_LABELS, formatPlanPrice, formatRenewalDate, activeStore, planRenewal, renewalText } from "./soloAccess";
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

const TIER_RANK = { free: 0, plus: 1, all_access: 2 };

// Bought a lower plan while a higher one is still running (Apple moves you
// down at the next renewal, not now): say so, with the date (#162). The
// welcome itself is for the plan that's actually active.
export function pendingChangeNote(activeTier, boughtTier, renewal) {
  if (!boughtTier || !activeTier || boughtTier === activeTier || !(TIER_RANK[boughtTier] < TIER_RANK[activeTier])) return "";
  const when = renewal?.date ? new Date(renewal.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "your renewal date";
  return `You chose ${TIER_LABELS[boughtTier]}. Your ${TIER_LABELS[activeTier]} plan stays until ${when}, then it switches to ${TIER_LABELS[boughtTier]}.`;
}

// A cancelled Apple plan that's still inside its paid period (#164). Buying
// a LOWER plan then makes Apple turn the cancelled one back on and switch
// down only at its end date — they'd get (and keep paying for) the higher
// plan. So the app offers only that plan until it ends.
export function appleLapsingHigher(entitlement, tier, now = Date.now()) {
  const s = entitlement?.sources?.apple;
  if (!s || !(Number(s.expiresAt) > now)) return null;
  const cancelled = s.status === "cancelled" || s.willRenew === false;
  if (!cancelled || !(TIER_RANK[s.tier] > TIER_RANK[tier])) return null;
  return { tier: s.tier, date: Number(s.expiresAt) };
}

const PaywallCtx = createContext({ openPaywall: () => {}, membershipChecking: false });
export const useSoloPaywall = () => useContext(PaywallCtx);

// The membership sheet's own glass: lighter and clearer than the standard
// Solo sheet (soloSheetGlass) so the page shows through, with a stronger
// blur and saturation so text stays readable.
function paywallSurface(dark) {
  return soloClearSheetGlass(dark);
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

// Kept in localStorage, not sessionStorage (#154): if iOS leaves the
// reloaded page undrawn, the native app replaces it with a brand-new web
// view, which has an empty sessionStorage — the result must survive that.
// It stays until the flow is finished (welcome dismissed, or the error /
// "not reached yet" shown), so a page replaced mid-flow shows it again;
// 10 minutes at most.
function rememberPurchaseOutcome(outcome) {
  try {
    localStorage.setItem(PURCHASE_OUTCOME_KEY, JSON.stringify({ ...outcome, at: Date.now() }));
  } catch {
    // No storage: the reload still redraws the page, and the purchase is
    // picked up by the sync on open (#133).
  }
}

function clearPurchaseOutcome() {
  try {
    localStorage.removeItem(PURCHASE_OUTCOME_KEY);
    sessionStorage.removeItem(PURCHASE_OUTCOME_KEY); // from builds before #154
  } catch {
    // nothing to clear
  }
}

function readPurchaseOutcome() {
  try {
    const raw = localStorage.getItem(PURCHASE_OUTCOME_KEY) || sessionStorage.getItem(PURCHASE_OUTCOME_KEY);
    if (!raw) return null;
    const outcome = JSON.parse(raw);
    if (outcome && Date.now() - (outcome.at || 0) < 10 * 60 * 1000) return outcome;
    clearPurchaseOutcome();
    return null;
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
  const { soloAuthUser, refreshSoloEntitlement, soloEntitlement, soloTier, soloEntitlementReady } = useSoloApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [outcome] = useState(readPurchaseOutcome);
  const signedIn = !!soloAuthUser;
  // After the reload: "confirming" while the server is asked, then the
  // welcome screen for the plan it confirms (#136).
  const [confirming, setConfirming] = useState(() => !!outcome?.ok);
  const [welcomeTier, setWelcomeTier] = useState(null);
  // The plan they chose on Apple's sheet, when it isn't the one active now
  // (#162: bought Plus while an All Access plan was still running).
  const [boughtTier, setBoughtTier] = useState(null);

  // The result of a purchase made just before the reload above.
  useEffect(() => {
    if (outcome?.cancelled) clearPurchaseOutcome();
    if (!outcome || outcome.cancelled || !signedIn) return;
    if (outcome.error) {
      clearPurchaseOutcome();
      openPaywall({ tier: outcome.tier, notice: outcome.error });
      return;
    }
    let stopped = false;
    const notReached = "Apple confirmed your purchase, but it hasn't reached your account yet. Try Restore purchases in a minute.";
    const ask = () => refreshSoloEntitlement().then((r) => r?.tier).catch(() => null);
    (async () => {
      let got = await ask();
      // RevenueCat can take a moment to see a brand-new purchase — or an
      // upgrade (a lower plan than the one just bought is the old state, not
      // the answer: never welcome someone to the plan they're leaving, #162).
      for (let i = 0; i < 3 && (!got || TIER_RANK[got] < TIER_RANK[outcome.tier]); i++) {
        await new Promise((r) => setTimeout(r, PURCHASE_RECHECK_MS));
        if (stopped) return;
        got = (await ask()) || got;
      }
      if (stopped) return;
      setConfirming(false);
      if (got && got !== "free") {
        setWelcomeTier(got);
        setBoughtTier(outcome.tier || null);
      }
      else {
        clearPurchaseOutcome();
        openPaywall({ tier: outcome.tier, notice: notReached });
      }
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

  // Back from Stripe (website). Every return is a fresh page load, so it
  // must settle on a real screen with the true plan straight away (#181):
  //  - /solo/home?subscribed=<plan>&session_id=… (checkout paid, #157):
  //    "Confirming your membership" while the server unlocks it from that
  //    checkout (before Stripe's webhook), then the welcome. The tier still
  //    only ever comes from the server.
  //  - /solo/home?subscribe=cancelled (checkout abandoned): the membership
  //    sheet again, saying nothing was charged. Used to land on Home with the
  //    query left in the address and no word about what happened.
  //  - /solo/home?soloTab=profile[&billing=returned] (billing portal, e.g.
  //    after cancelling): the plan is re-read from Stripe at once, and
  //    Profile says "Checking your membership" instead of showing the phone's
  //    old copy (the cancelled plan) until the webhook arrives.
  // The query is then removed from the address (replace, no new history
  // entry), so a refresh or Back never replays the return.
  const [webPlan, setWebPlan] = useState(null);
  const [webWelcome, setWebWelcome] = useState(false);
  const [membershipChecking, setMembershipChecking] = useState(false);
  const [abandonedCheckout, setAbandonedCheckout] = useState(false);
  const [webConfirmedTier, setWebConfirmedTier] = useState(null);
  const webReturnStopRef = useRef(null);
  useEffect(() => {
    if (!signedIn) return;
    const params = new URLSearchParams(location.search);
    const plan = params.get("subscribed");
    const sessionId = params.get("session_id");
    const abandoned = params.get("subscribe") === "cancelled";
    const portal = params.get("billing") === "returned";
    // Old servers' portal return (?soloTab=profile with no marker): treated
    // the same, since only Stripe's portal links to Profile by query.
    const portalTab = params.get("soloTab");
    if (!plan && !abandoned && !portal && !portalTab) return;
    ["subscribed", "session_id", "subscribe", "billing", "soloTab"].forEach((k) => params.delete(k));
    const search = params.toString();
    const state = portalTab ? { ...(location.state || {}), soloTab: portalTab } : location.state;
    navigate(location.pathname + (search ? `?${search}` : ""), { replace: true, state });
    if (plan) {
      setWebPlan(plan);
      setConfirming(true);
      let stopped = false;
      (async () => {
        // Asked at once, then a few more times while Stripe settles.
        for (let i = 0; i < 4 && !stopped; i++) {
          if (i) await new Promise((r) => setTimeout(r, PURCHASE_RECHECK_MS));
          if (stopped) return;
          const got = await refreshSoloEntitlement(sessionId ? { checkoutSessionId: sessionId } : undefined)
            .then((r) => r?.tier)
            .catch(() => null);
          if (stopped) return;
          if (got && got !== "free") {
            setWebConfirmedTier(got);
            return;
          }
        }
      })();
      webReturnStopRef.current = () => {
        stopped = true;
      };
    } else if (abandoned) {
      setAbandonedCheckout(true);
    } else {
      setMembershipChecking(true);
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        setMembershipChecking(false);
      };
      Promise.resolve(refreshSoloEntitlement()).catch(() => {}).then(done);
      // Never left saying "Checking" (no signal): the phone's copy and the
      // live listener take over.
      setTimeout(done, 8000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, signedIn]);
  useEffect(() => () => webReturnStopRef.current?.(), []);
  useEffect(() => {
    if (!webPlan) return;
    // The server's reply to the sync, or the live listener — whichever
    // arrives first.
    const confirmed = webConfirmedTier || (soloTier && soloTier !== "free" ? soloTier : null);
    if (confirmed) {
      webReturnStopRef.current?.();
      setWebPlan(null);
      setWebConfirmedTier(null);
      setConfirming(false);
      setWebWelcome(true);
      setWelcomeTier(confirmed);
      return;
    }
    // Stripe's confirmation can lag; say so rather than leave them guessing.
    const id = setTimeout(() => {
      webReturnStopRef.current?.();
      setWebPlan(null);
      setConfirming(false);
      openPaywall({ tier: PLANS[webPlan]?.tier || "all_access", notice: "Payment received — your membership is on its way and unlocks in a minute or two. No need to pay again." });
    }, 15000);
    return () => clearTimeout(id);
  }, [webPlan, webConfirmedTier, soloTier, openPaywall]);
  // Abandoned checkout: back to the membership sheet once this account's plan
  // is known (never opened by itself before that, #137).
  useEffect(() => {
    if (!abandonedCheckout || !soloEntitlementReady) return;
    setAbandonedCheckout(false);
    openPaywall({ notice: "Checkout cancelled — you haven't been charged." });
  }, [abandonedCheckout, soloEntitlementReady, openPaywall]);

  // membershipChecking: Profile shows "Checking your membership" rather than
  // a plan that may have just been cancelled (#181).
  const value = useMemo(() => ({ openPaywall, membershipChecking }), [openPaywall, membershipChecking]);
  const renewal = renewalText(planRenewal(soloEntitlement));
  return (
    <PaywallCtx.Provider value={value}>
      {children}
      {confirming && <SoloPurchaseStage instant title="Confirming your membership" detail="One moment." />}
      {welcomeTier && (
        <SoloWelcomeScreen
          tier={welcomeTier}
          renewal={renewal ? (webWelcome ? renewal : `${renewal} · App Store`) : ""}
          note={pendingChangeNote(welcomeTier, boughtTier, planRenewal(soloEntitlement))}
          onDone={() => {
            clearPurchaseOutcome();
            setWelcomeTier(null);
            setBoughtTier(null);
            setWebWelcome(false);
            // Straight to Train Solo Home after a purchase (#166), whichever
            // page it was bought from.
            if (location.pathname !== "/solo/home") navigate("/solo/home", { replace: true });
          }}
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
  // Back from Stripe with the browser's back button (page cache): the
  // button left busy above is usable again.
  useEffect(() => {
    const onShow = (e) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  // Every time the sheet opens, the plan is re-read from the stores first
  // (#162): this phone's copy can be behind (a purchase or upgrade whose
  // update never reached it), and a member who already has a plan must never
  // be offered — and pay for — it again. Buying waits for the answer (a few
  // seconds at most); the sheet updates itself from the server's reply.
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!open || !soloAuthUser) return;
    let done = false;
    setChecking(true);
    const finish = () => {
      if (done) return;
      done = true;
      setChecking(false);
    };
    Promise.resolve(refreshSoloEntitlement?.()).catch(() => {}).then(finish);
    const cap = setTimeout(finish, 6000);
    return () => {
      done = true;
      clearTimeout(cap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // A Plus member can only move up, so All Access is always preselected for them.
    // A website subscriber starts on the plan they have (#159).
    const current = !iosApp && activeStore(soloEntitlement) === "stripe" ? PLANS[soloEntitlement?.sources?.stripe?.plan] : null;
    if (current) {
      setTier(current.tier);
      setInterval_(current.interval);
    } else {
      setTier(request.tier === "plus" && soloTier !== "plus" ? "plus" : "all_access");
      setInterval_("year");
    }
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
    if (paidElsewhere || checking || lapsingHigher) return;
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
        // …and a beat more, so the membership sheet is never in that picture (#164).
        await new Promise((r) => setTimeout(r, 150));
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
        // Stays busy while the page leaves for Stripe: a second tap would
        // open a second checkout, and paying both is two subscriptions (#157).
        reloading = true;
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
        if (nativeIap) {
          await manageAppleSubscription();
          // Back from Apple's screen: a cancel there ends access now (#156).
          await refreshSoloEntitlement().catch(() => {});
        } else setMessage("Manage it in iPhone Settings → your name → Subscriptions.");
        return;
      }
      // Busy from the tap until the page has gone to Stripe (#181): it gave
      // no sign of life for the round trip, and each extra tap opened
      // another portal session. pageshow (Back from Stripe) frees it.
      if (busy) return;
      setBusy(true);
      const { url } = await openSoloBillingPortal();
      if (url) {
        window.location.href = url;
        return;
      }
      setBusy(false);
    } catch (err) {
      setBusy(false);
      setMessage(err?.message || "Couldn't open subscription settings.");
    }
  }

  // A website (Stripe) subscriber on the website changes plan right here —
  // up, down, or monthly ↔ yearly — through the server's in-place change
  // (pro rata, functions checkoutDecision "change"). Downgrading from All
  // Access used to be possible only through Stripe's portal (#159).
  const stripePlan = store === "stripe" ? soloEntitlement?.sources?.stripe?.plan || null : null;
  const changeHere = !iosApp && !!stripePlan;
  const alreadyThis = changeHere ? plan === stripePlan : soloTier === "all_access" || (soloTier === "plus" && tier === "plus");
  // A website subscriber in the iPhone app (#158): an Apple purchase here
  // would be a SECOND subscription — the website one keeps charging. Their
  // plan is changed where they bought it; said without a link or a mention
  // of the website (3.1.1).
  const paidElsewhere = iosApp && store === "stripe";
  const lapsingHigher = iosApp ? appleLapsingHigher(soloEntitlement, tier) : null;
  // Inside the app, a website subscriber manages it on the website — said
  // without a link or price (3.1.1).
  const canManageHere = store === "stripe" ? !iosApp : store === "apple";

  return (
    <>
    {openingStore && <SoloPurchaseStage instant title="Opening the App Store" detail="Complete your purchase in Apple's window." />}
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
                </p>
              )}
              {canManageHere && (
                <p className="text-xs mt-0.5" style={{ color: t.textMuted }} data-testid="cancel-note">
                  Cancelling ends it straight away.
                </p>
              )}
            </div>
            {canManageHere && (
              <button type="button" onClick={manage} disabled={busy} className="text-xs font-bold underline underline-offset-2 shrink-0">
                {busy && store === "stripe" ? "Opening…" : "Manage"}
              </button>
            )}
          </div>
        )}

        {(soloTier !== "all_access" || changeHere) && (
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
                if (!changeHere && soloTier === "plus" && key === "plus") return null;
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
              ) : alreadyThis ? (
                changeHere ? (
                  <p className="text-sm text-center font-semibold py-3" style={{ color: t.textMuted }} data-testid="current-plan">
                    Your current plan
                  </p>
                ) : null
              ) : paidElsewhere ? (
                <p className="text-sm text-center font-semibold py-3 rounded-full" style={planGlass(dark, false)} data-testid="paid-elsewhere">
                  Your plan can't be changed in the app
                </p>
              ) : lapsingHigher ? (
                <p className="text-sm text-center leading-relaxed py-3" style={{ color: t.textMuted }} data-testid="lapsing-higher">
                  Your cancelled {TIER_LABELS[lapsingHigher.tier]} plan runs until {formatRenewalDate(lapsingHigher.date)}. The App Store can only start {TIER_LABELS[tier]} after that — choose {TIER_LABELS[lapsingHigher.tier]} to keep it now.
                </p>
              ) : (
                <PrimaryButton dark={dark} className="w-full" onClick={buy} disabled={busy || checking || (iosApp && !price)}>
                  {busy
                    ? "ONE MOMENT…"
                    : checking
                      ? "CHECKING YOUR MEMBERSHIP…"
                    : changeHere
                      ? `SWITCH TO ${TIER_LABELS[tier].toUpperCase()} ${interval === "year" ? "YEARLY" : "MONTHLY"}`
                      : trialDays > 0
                        ? `START ${trialDays}-DAY FREE TRIAL`
                        : `SUBSCRIBE TO ${TIER_LABELS[tier].toUpperCase()}`}
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
                  {changeHere && !alreadyThis ? "Your plan changes now; the difference is charged or credited pro rata. " : ""}
                  Renews automatically until you cancel; cancel at least 24 hours before it renews to avoid the next charge. Cancelling ends your membership straight away, with no refund for the rest of the period.
                  {iosApp ? " Manage or cancel in iPhone Settings." : " Manage or cancel any time from Profile."}
                </p>
              )}
            </div>
          </>
        )}

        {soloTier === "all_access" && !changeHere && message && <p className="text-sm mt-2">{message}</p>}

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
