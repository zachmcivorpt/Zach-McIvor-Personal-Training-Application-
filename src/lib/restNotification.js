// The rest timer's lock-screen alert — the iOS App Store build only. The
// page's own timer can't ding while the phone is locked, so when a rest
// starts the native app schedules a local notification for the moment it
// ends (ios/ApexCoach/RestTimerBridge.swift); Skip or a new rest cancels
// or replaces it. Everywhere else (a browser, Android, an older iOS build
// without the apexRest handler) these do nothing.

function handler() {
  return typeof window !== "undefined" ? window.webkit?.messageHandlers?.apexRest : null;
}

export function restNotificationAvailable() {
  return !!handler();
}

export function scheduleRestNotification(seconds, exerciseName) {
  const h = handler();
  const s = Math.round(Number(seconds));
  if (!h || !Number.isFinite(s) || s < 1) return;
  try {
    h.postMessage({
      action: "schedule",
      seconds: Math.min(s, 3600),
      title: "Rest's up",
      body: exerciseName ? `Time for your next set of ${exerciseName}.` : "Time for your next set.",
    });
  } catch {}
}

export function cancelRestNotification() {
  const h = handler();
  if (!h) return;
  try {
    h.postMessage({ action: "cancel" });
  } catch {}
}
