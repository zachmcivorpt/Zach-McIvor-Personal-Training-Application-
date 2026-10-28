import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Sun, Moon, AlertTriangle, CalendarDays, Bell, ChevronRight, Activity } from "lucide-react";
import { appleHealthAvailable, isAppleHealthOn, connectAppleHealth, disconnectAppleHealth } from "../lib/appleHealth";
import { enableSoloPush, hasSoloPushToken } from "../lib/push";
import { canUse, TIER_LABELS, activeStore, planRenewal, renewalText } from "./soloAccess";
import { useSoloPaywall } from "./SoloPaywall";
import { inIosApp } from "./appShell";
import SoloGlassBox from "./SoloGlassBox";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES, soloGlass } from "./SoloThemeContext";
import { isFlaggedForMedicalReview } from "./onboarding/questionnaireConfig";
import { DeleteAccountSheet } from "../components/ui";

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
  const { soloCurrentUser, soloLogout, soloPurchases, soloPrograms, deleteMySoloAccount, setSoloReminderPref, soloAccess, soloTier, soloGatesLive, soloEntitlement } = useSoloApp();
  const { openPaywall } = useSoloPaywall();
  // Apple Health on Progress is a Plus feature once subscriptions launch.
  const healthAllowed = canUse("appleHealthProgress", soloAccess);
  const subscriptionStore = activeStore(soloEntitlement);
  const renewal = planRenewal(soloEntitlement);
  const { dark, accent, toggleSoloTheme } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const flagged = isFlaggedForMedicalReview(soloCurrentUser?.onboarding?.answers || {});
  const [deleteOpen, setDeleteOpen] = useState(false);
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
    <div className="w-full max-w-md mx-auto px-3 pt-5 pb-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-extrabold">Profile</h1>
        <button
          onClick={toggleSoloTheme}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={soloGlass(t)}
        >
          {dark ? <Sun size={15} color={t.text} /> : <Moon size={15} color={t.text} />}
        </button>
      </div>

      <div className="rounded-2xl px-4 py-4 mb-5" style={soloGlass(t)}>
        <p className="text-sm font-bold">{soloCurrentUser?.name || "there"}</p>
        <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
          {soloCurrentUser?.email}
        </p>
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
              <span className="block text-sm font-semibold">Train Solo {TIER_LABELS[soloTier]}</span>
              <span className="block text-xs mt-0.5" style={{ color: t.textMuted }}>
                {soloTier === "free"
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
    </div>
  );
}
