import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Sun, Moon, AlertTriangle, CalendarDays, Bell, ChevronRight, Activity, Compass } from "lucide-react";
import { appleHealthAvailable, isAppleHealthOn, connectAppleHealth, disconnectAppleHealth } from "../lib/appleHealth";
import { enableSoloPush, hasSoloPushToken } from "../lib/push";
import { canUse, TIER_LABELS, activeStore, planRenewal, renewalText } from "./soloAccess";
import { useSoloPaywall } from "./SoloPaywall";
import { inIosApp } from "./appShell";
import SoloGlassBox from "./SoloGlassBox";
import { SoloPageHeader } from "./SoloUI";
import SoloGettingStarted from "./SoloGettingStarted";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES, soloGlass } from "./SoloThemeContext";
import { isFlaggedForMedicalReview } from "./onboarding/questionnaireConfig";
import { DeleteAccountSheet } from "../components/ui";
import { inAppPurchasesAvailable } from "../lib/purchases";
import SoloPurchaseLog from "./SoloPurchaseLog";

// Adapted from ClientApp.jsx's ProfileScreen: same avatar/name card, sign
// out, legal links and delete-account pattern, but with every coach-
// dependent row removed (Goals/Equipment/Training preferences were set
// during Coaching's own onboarding; Messages/Check-ins/Quick Tips assume a
// coach; Connected devices is WHOOP, a Coaching-only integration) and
// every notification row removed (Train Solo has none, anywhere — see the
// comment below). Nutrition preferences is gone too — no nutrition
// tracking in Train Solo's scope. "My Programs" replaces all of that with
// what's actually relevant here: what this customer owns.
//
// My Calendar opens SoloCalendarScreen. Monday check-in reminders are
// Train Solo's one notification: a weekly push to log body stats and take
// progress photos (soloWeeklyCheckInReminder in functions/index.js).
export default function SoloProfileScreen() {
  const { soloCurrentUser, soloLogout, soloPurchases, soloPrograms, soloWorkoutLogs, deleteMySoloAccount, setSoloReminderPref, soloAccess, soloTier, soloGatesLive, soloEntitlement, soloTestAccount } = useSoloApp();
  const { openPaywall, membershipChecking } = useSoloPaywall();
  // Apple Health on Progress is a Plus feature once subscriptions launch.
  const healthAllowed = canUse("appleHealthProgress", soloAccess);
  const subscriptionStore = activeStore(soloEntitlement);
  const renewal = planRenewal(soloEntitlement);
  const { dark, accent, toggleSoloTheme } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const flagged = isFlaggedForMedicalReview(soloCurrentUser?.onboarding?.answers || {});
  const [startedOpen, setStartedOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [purchaseLogOpen, setPurchaseLogOpen] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderError, setReminderError] = useState("");
  const uid = soloCurrentUser?.id;
  // On the App Store build the device token is saved automatically at
  // launch (nativeBridge.js) once iOS notification permission is granted;
  // in a browser this device needs to opt in once. (push.js's isNativeApp is
  // always false at import time, so the App Store app is detected with
  // inIosApp() instead.)
  const iosApp = inIosApp();
  const deviceRegistered = !!uid && hasSoloPushToken(uid);
  const remindersOn = !!deviceRegistered && soloCurrentUser?.notificationPrefs?.weeklyCheckIn !== false;
  // Apple Health — only in the iPhone app (src/lib/appleHealth.js); synced
  // by SoloShell while the app is open.
  const healthAvailable = appleHealthAvailable();
  const [healthOn, setHealthOn] = useState(() => isAppleHealthOn("solo", uid));
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthError, setHealthError] = useState("");
  useEffect(() => setHealthOn(isAppleHealthOn("solo", uid)), [uid]);

  async function toggleHealth() {
    if (!uid || healthBusy) return;
    setHealthError("");
    if (healthOn) {
      disconnectAppleHealth("solo", uid);
      setHealthOn(false);
      return;
    }
    if (!healthAllowed) {
      openPaywall({ tier: "plus", reason: "Sync steps, sleep, resting heart rate and weight from Apple Health to Progress — part of Plus." });
      return;
    }
    setHealthBusy(true);
    try {
      await connectAppleHealth("solo", uid);
      setHealthOn(true);
    } catch (err) {
      setHealthError(err?.message || "Couldn't connect Apple Health — please try again.");
    } finally {
      setHealthBusy(false);
    }
  }

  async function toggleReminders() {
    if (!uid || reminderBusy) return;
    setReminderError("");
    setReminderBusy(true);
    try {
      if (remindersOn) {
        await setSoloReminderPref(uid, false);
      } else {
        if (!deviceRegistered) {
          // The App Store app's web view has no browser Push API — its
          // token only arrives from iOS itself, after permission is given.
          if (iosApp) {
            setReminderError("Allow notifications for APEX in your iPhone Settings, then reopen the app to turn these on.");
            return;
          }
          await enableSoloPush(uid);
        }
        await setSoloReminderPref(uid, true);
      }
    } catch (err) {
      setReminderError(err?.message || "Couldn't update reminders — please try again.");
    } finally {
      setReminderBusy(false);
    }
  }

  const programsById = useMemo(() => Object.fromEntries(soloPrograms.map((p) => [p.id, p])), [soloPrograms]);

  return (
    <div className="w-full max-w-md mx-auto px-3 pb-10">
      <SoloPageHeader
        t={t}
        title="Profile"
        className="-mx-3"
        right={
          <button
            onClick={toggleSoloTheme}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            className="w-9 h-9 -my-1 rounded-full flex items-center justify-center shrink-0"
            style={soloGlass(t)}
          >
            {dark ? <Sun size={15} color={t.text} /> : <Moon size={15} color={t.text} />}
          </button>
        }
      />

      {/* Ringed initials, the name large, then their own totals (#196). */}
      <div className="flex flex-col items-center text-center pt-2 pb-5">
        <span className="relative w-[104px] h-[104px] flex items-center justify-center" style={{ filter: dark ? "drop-shadow(0 0 12px rgba(255,255,255,0.45))" : "none" }}>
          <svg aria-hidden="true" viewBox="0 0 86 86" className="absolute inset-0 w-full h-full" style={{ color: t.text }}>
            <circle cx="43" cy="43" r="38" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="1" />
            <path d="M43 5 A38 38 0 0 1 81 43" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M43 81 A38 38 0 0 1 5 43" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="43" cy="43" r="30" fill="none" stroke="currentColor" strokeOpacity=".5" strokeWidth="1" strokeDasharray="2 5" />
          </svg>
          <span className="text-[24px] font-extrabold">{initials(soloCurrentUser?.name)}</span>
        </span>
        <p className="text-[22px] font-extrabold uppercase tracking-[0.02em] mt-3 leading-tight">{soloCurrentUser?.name || "there"}</p>
        <p className="text-xs mt-1" style={{ color: t.textMuted }}>
          {soloCurrentUser?.email}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="rounded-2xl px-4 py-3" style={soloGlass(t)}>
          <p className="text-[26px] font-bold leading-none tabular-nums">{(soloWorkoutLogs || []).length}</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] mt-1.5" style={{ color: t.textMuted }}>
            Sessions logged
          </p>
        </div>
        <div className="rounded-2xl px-4 py-3" style={soloGlass(t)}>
          <p className="text-[26px] font-bold leading-none tabular-nums">{kgLifted(soloWorkoutLogs).toLocaleString()}</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] mt-1.5" style={{ color: t.textMuted }}>
            Kg lifted
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between py-3 mb-5 border-y" style={{ borderColor: t.panelBorder }}>
        <span className="text-sm font-semibold">Appearance</span>
        <span className="flex gap-1.5" role="group" aria-label="Appearance">
          {[["Black", true], ["White", false]].map(([label, isDark]) => (
            <button
              key={label}
              type="button"
              aria-pressed={dark === isDark}
              onClick={() => dark !== isDark && toggleSoloTheme()}
              className="h-7 px-3 rounded-full text-[10px] font-extrabold uppercase tracking-[0.1em]"
              style={dark === isDark ? { backgroundColor: t.text, color: t.bg } : { border: `1px solid ${t.panelBorder}`, color: t.textMuted }}
            >
              {label}
            </button>
          ))}
        </span>
      </div>

      {flagged && (
        <div className="rounded-2xl px-4 py-3.5 mb-5 flex gap-2.5" style={soloGlass(t)}>
          <AlertTriangle size={16} color={accent} className="shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed" style={{ color: t.textMuted }}>
            Based on your answers, it's worth checking in with a doctor or allied health professional before training. This isn't a
            diagnosis or medical clearance — just a standard first-pass safety flag.
          </p>
        </div>
      )}

      {soloGatesLive && (
        <>
          <p className="text-[11px] font-bold tracking-wide uppercase mb-2.5" style={{ color: t.textFaint }}>
            Subscription
          </p>
          <button type="button" onClick={() => openPaywall({})} className="w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 mb-5 text-left" style={soloGlass(t)}>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold">Train Solo {membershipChecking ? "membership" : TIER_LABELS[soloTier]}</span>
              <span className="block text-xs mt-0.5" style={{ color: t.textMuted }}>
                {/* Back from Stripe's portal: never the plan they may have
                    just cancelled while it's re-read (#181). */}
                {membershipChecking
                  ? "Checking your membership…"
                  : soloTier === "free"
                  ? "See Plus and All Access"
                  : renewal
                  ? `${renewalText(renewal)}${subscriptionStore === "apple" ? " · App Store" : iosApp ? "" : " · manage"}`
                  : subscriptionStore === "apple"
                  ? "Through the App Store · manage"
                  : iosApp
                  ? "Your plan"
                  : "Manage your subscription"}
              </span>
            </span>
            <ChevronRight size={16} color={t.textFaint} className="shrink-0" />
          </button>
        </>
      )}

      <p className="text-[11px] font-bold tracking-wide uppercase mb-2.5" style={{ color: t.textFaint }}>
        My Programs
      </p>
      {soloPurchases.length === 0 ? (
        <p className="text-sm mb-5" style={{ color: t.textMuted }}>
          You don't own any programs yet — browse the Catalogue tab.
        </p>
      ) : (
        <div className="rounded-2xl overflow-hidden mb-5" style={soloGlass(t)}>
          {soloPurchases.map((purchase, i) => {
            const program = programsById[purchase.programId];
            if (!program) return null;
            // From the public program doc's own small weekOnePreview slice
            // — see AppContext.jsx's computeWeekOnePreview comment — not
            // from soloProgramContent, which this list doesn't need.
            const totalWeeks = program.weekOnePreview?.totalWeeks || 0;
            return (
              <div
                key={purchase.id}
                className="px-4 py-3.5"
                style={{ borderBottom: i < soloPurchases.length - 1 ? `1px solid ${t.panelBorder}` : "none" }}
              >
                <p className="text-sm font-semibold">{program.name}</p>
                <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
                  {program.level} · {totalWeeks} week{totalWeeks === 1 ? "" : "s"}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <SoloGlassBox t={t} className="rounded-2xl mb-5">
        {/* Getting Started (#180): always here, so it can be watched again. */}
        <button type="button" onClick={() => setStartedOpen(true)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left" style={{ borderBottom: `1px solid ${t.panelBorder}` }}>
          <Compass size={17} color={t.textMuted} className="shrink-0" />
          <span className="text-sm font-semibold flex-1">Getting Started</span>
          <ChevronRight size={16} color={t.textFaint} />
        </button>
        <Link to="/solo/calendar" className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: `1px solid ${t.panelBorder}` }}>
          <CalendarDays size={17} color={t.textMuted} className="shrink-0" />
          <span className="text-sm font-semibold flex-1">My Calendar</span>
          <ChevronRight size={16} color={t.textFaint} />
        </Link>
        <button
          type="button"
          onClick={toggleReminders}
          disabled={reminderBusy}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
          style={healthAvailable ? { borderBottom: `1px solid ${t.panelBorder}` } : undefined}
        >
          <Bell size={17} color={t.textMuted} className="shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold">Monday check-in reminders</span>
            <span className="block text-xs mt-0.5" style={{ color: t.textMuted }}>
              Body stats and progress photos, every Monday.
            </span>
          </span>
          <span
            role="switch"
            aria-checked={remindersOn}
            className="w-11 h-6 rounded-full p-0.5 shrink-0 transition-colors"
            style={{ backgroundColor: remindersOn ? accent : t.chipBg, border: `1px solid ${t.panelBorder}`, opacity: reminderBusy ? 0.6 : 1 }}
          >
            <span className="block w-5 h-5 rounded-full bg-white shadow transition-transform" style={{ transform: remindersOn ? "translateX(18px)" : "none" }} />
          </span>
        </button>
        {reminderError && <p className="text-xs text-red-500 px-4 pb-3 -mt-1">{reminderError}</p>}
        {healthAvailable && (
          <button type="button" onClick={toggleHealth} disabled={healthBusy} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
            <Activity size={17} color={t.textMuted} className="shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold">Apple Health</span>
              <span className="block text-xs mt-0.5" style={{ color: t.textMuted }}>
                Sync steps, sleep, resting heart rate and weight to Progress.
              </span>
            </span>
            <span
              role="switch"
              aria-checked={healthOn}
              className="w-11 h-6 rounded-full p-0.5 shrink-0 transition-colors"
              style={{ backgroundColor: healthOn ? accent : t.chipBg, border: `1px solid ${t.panelBorder}`, opacity: healthBusy ? 0.6 : 1 }}
            >
              <span className="block w-5 h-5 rounded-full bg-white shadow transition-transform" style={{ transform: healthOn ? "translateX(18px)" : "none" }} />
            </span>
          </button>
        )}
        {healthError && <p className="text-xs text-red-500 px-4 pb-3 -mt-1">{healthError}</p>}
      </SoloGlassBox>

      <SoloGlassBox t={t} className="rounded-2xl mb-5">
        <Link
          to="/solo/consultation"
          className="block px-4 py-3.5 text-sm font-semibold"
          style={{ borderBottom: `1px solid ${t.panelBorder}` }}
        >
          Review my consultation answers
        </Link>
        <button onClick={soloLogout} className="block w-full text-left px-4 py-3.5 text-sm font-semibold" style={{ color: "#EF4444" }}>
          Log out
        </button>
      </SoloGlassBox>

      <div className="flex items-center justify-center gap-4">
        <Link to="/legal/privacy-policy" className="text-xs font-medium" style={{ color: t.textFaint }}>
          Privacy Policy
        </Link>
        <Link to="/legal/terms-of-service" className="text-xs font-medium" style={{ color: t.textFaint }}>
          Terms of Service
        </Link>
        <button onClick={() => setDeleteOpen(true)} className="text-xs font-medium text-red-500/70">
          Delete account
        </button>
      </div>
      {/* Test accounts in the iPhone app (#183): what the app recorded around
          Apple's last purchase / manage sheet, to send when reporting. */}
      {soloTestAccount && inAppPurchasesAvailable() && (
        <div className="flex justify-center mt-3">
          <button type="button" onClick={() => setPurchaseLogOpen(true)} className="text-xs font-medium" style={{ color: t.textFaint }}>
            Purchase log
          </button>
        </div>
      )}

      {/* The 3D muscle map's model is CC BY 4.0: its credit lives here (#204). */}
      <p className="text-[10px] text-center mt-6 px-4" style={{ color: t.textFaint }}>
        Muscle map anatomy: BodyParts3D © DBCLS (CC BY 4.0), via open-anatomy-3d.
      </p>

      <DeleteAccountSheet
        dark={dark}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        warning={
          subscriptionStore === "apple"
            ? "This permanently deletes your Train Solo account, every program you own, and your workout history. This can't be undone. Your App Store subscription isn't cancelled by this — cancel it first in iPhone Settings → your name → Subscriptions."
            : "This permanently deletes your Train Solo account, every program you own, and your workout history. This can't be undone." +
              (subscriptionStore === "stripe" ? " Your subscription is cancelled straight away." : "")
        }
        onConfirm={async (password) => {
          await deleteMySoloAccount(password);
          setDeleteOpen(false);
        }}
      />
      <SoloGettingStarted open={startedOpen} onClose={() => setStartedOpen(false)} />
      {purchaseLogOpen && <SoloPurchaseLog onClose={() => setPurchaseLogOpen(false)} />}
    </div>
  );
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "–";
}

// Total kg lifted from their own logged sets, in full kg (#151).
function kgLifted(logs) {
  let kg = 0;
  for (const log of logs || []) for (const e of log.entries || []) for (const set of e.sets || []) kg += (Number(set.weight) || 0) * (Number(set.reps) || 0);
  return Math.round(kg);
}
