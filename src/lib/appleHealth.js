// Apple Health — the iOS App Store build only. That build's WKWebView has
// no HealthKit, so native code (ios/ApexCoach/HealthBridge.swift) reads it
// and answers through window.__apexNativeHealth.receive. Everywhere else
// (a browser, Android, an App Store build from before 1.0.3) the
// apexHealth message handler doesn't exist and none of this shows.
//
// Read-only: steps, sleep, resting heart rate and body weight, per day.
// Steps/sleep/resting heart rate go into the same per-day body-metrics doc
// a client logs by hand (Coaching's bodyMetrics, Train Solo's
// soloBodyMetrics), each synced field marked in that doc's `appleHealth`
// map. Weight becomes an ordinary weigh-in. Nothing typed in by hand is
// ever overwritten.
import { useEffect, useRef } from "react";
import { collection, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { localDateKey } from "./dateKey";

const pending = new Map();
let seq = 0;

if (typeof window !== "undefined") {
  window.__apexNativeHealth = {
    receive(msg) {
      const p = pending.get(msg?.id);
      if (!p) return;
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(msg.error));
      else p.resolve(msg.result);
    },
  };
}

export function appleHealthAvailable() {
  return typeof window !== "undefined" && !!window.webkit?.messageHandlers?.apexHealth;
}

function ask(action, extra, timeoutMs) {
  if (!appleHealthAvailable()) return Promise.reject(new Error("Apple Health connects from the APEX iPhone app."));
  return new Promise((resolve, reject) => {
    const id = `h${++seq}`;
    const timer = setTimeout(() => {
      if (pending.delete(id)) reject(new Error("Apple Health didn't respond — please try again."));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    window.webkit.messageHandlers.apexHealth.postMessage({ id, action, ...extra });
  });
}

// On/off is remembered per account on this phone, and per side (a person
// can have both a Coaching and a Train Solo account), so it never carries
// over to someone else signing in on the same device.
const flagKey = (side, uid) => `appleHealth_${side}_${uid}`;
const weightsKey = (side, uid) => `appleHealthWeights_${side}_${uid}`;

function readLS(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

export function isAppleHealthOn(side, uid) {
  return !!uid && readLS(flagKey(side, uid)) === "1";
}

// Shows iOS's own Apple Health permission sheet (only the first time — iOS
// doesn't ask again after that; changes are made in the Health app).
export async function connectAppleHealth(side, uid) {
  await ask("authorize", {}, 5 * 60 * 1000);
  writeLS(flagKey(side, uid), "1");
  window.dispatchEvent(new Event("apexAppleHealthChanged"));
}

export function disconnectAppleHealth(side, uid) {
  writeLS(flagKey(side, uid), null);
  window.dispatchEvent(new Event("apexAppleHealthChanged"));
}

export async function readAppleHealthDays(days = 7) {
  const result = await ask("read", { days }, 30 * 1000);
  return Array.isArray(result?.days) ? result.days : [];
}

export const APPLE_HEALTH_FIELDS = ["steps", "sleepHours", "restingHeartRate"];

function cleanValue(field, raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (field === "sleepHours") return n > 24 ? null : Math.round(n * 10) / 10;
  return Math.round(n);
}

// Which writes one sync needs, given the person's current docs.
// - A metric is written when the day has no value yet, or the value there
//   came from Apple Health itself and has changed (today's steps keep
//   climbing). A value typed in by hand is left alone.
// - A weight becomes a weigh-in only on a day with no weigh-in at all, and
//   only once per day: `importedWeightDates` are days already brought in,
//   so a weigh-in the person deletes doesn't come straight back.
export function planAppleHealthSync(days, { bodyMetrics = [], weighIns = [], importedWeightDates = [] } = {}) {
  const byDate = Object.fromEntries(bodyMetrics.map((m) => [m.date, m]));
  const weighInDates = new Set(weighIns.map((w) => localDateKey(new Date(w.date))));
  const imported = new Set(importedWeightDates);
  const metrics = [];
  const weights = [];
  for (const day of days || []) {
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day.date || "")) continue;
    const existing = byDate[day.date] || {};
    const fromHealth = existing.appleHealth || {};
    for (const field of APPLE_HEALTH_FIELDS) {
      const value = cleanValue(field, day[field]);
      if (value == null) continue;
      if (existing[field] != null && (!fromHealth[field] || existing[field] === value)) continue;
      metrics.push({ date: day.date, field, value });
    }
    const kg = Number(day.weightKg);
    if (Number.isFinite(kg) && kg > 0 && kg < 500 && !weighInDates.has(day.date) && !imported.has(day.date)) {
      weights.push({ date: day.date, weight: Math.round(kg * 10) / 10 });
    }
  }
  return { metrics, weights };
}

// Where one person's synced data lives — Coaching:
// { db, metrics: "bodyMetrics", weighIns: "weighIns", owner: "clientId", uid },
// Train Solo: { db: soloDb, metrics: "soloBodyMetrics", weighIns: "soloWeighIns",
// owner: "soloUserId", uid }. Their docs are read fresh here (not from a
// snapshot that may still be loading) so a hand-typed value is never
// mistaken for an empty day. Writes match the hand-logged shapes exactly
// (logBodyMetric / logWeight and their Train Solo twins). Returns the
// weigh-in dates added.
export async function applyAppleHealthDays(target, days, importedWeightDates) {
  const { db, metrics: metricsCol, weighIns: weighInsCol, owner, uid } = target;
  const [metricsSnap, weighInsSnap] = await Promise.all([
    getDocs(query(collection(db, metricsCol), where(owner, "==", uid))),
    getDocs(query(collection(db, weighInsCol), where(owner, "==", uid))),
  ]);
  const plan = planAppleHealthSync(days, {
    bodyMetrics: metricsSnap.docs.map((d) => d.data()),
    weighIns: weighInsSnap.docs.map((d) => d.data()),
    importedWeightDates,
  });
  await Promise.all(
    plan.metrics.map(({ date, field, value }) => {
      const id = `${uid}_${date}`;
      return setDoc(doc(db, metricsCol, id), { id, [owner]: uid, date, [field]: value, appleHealth: { [field]: true } }, { merge: true });
    })
  );
  const added = [];
  for (const { date: dateKey, weight } of plan.weights) {
    const id = doc(collection(db, weighInsCol)).id;
    let date = Date.now();
    if (dateKey !== localDateKey()) {
      const [y, m, d] = dateKey.split("-").map(Number);
      date = new Date(y, m - 1, d, 12, 0, 0).getTime();
    }
    await setDoc(doc(db, weighInsCol, id), { id, [owner]: uid, weight, date });
    added.push(dateKey);
  }
  return added;
}

// One sync: the last week from Apple Health into `target`, remembering
// which days' weights were brought in.
export async function runAppleHealthSync(side, target) {
  const { uid } = target;
  const days = await readAppleHealthDays(7);
  if (!days.length) return;
  let importedWeightDates = [];
  try {
    importedWeightDates = JSON.parse(readLS(weightsKey(side, uid)) || "[]");
  } catch {}
  const added = await applyAppleHealthDays(target, days, importedWeightDates);
  if (added.length) {
    const cutoff = localDateKey(new Date(Date.now() - 60 * 24 * 3600 * 1000));
    const keep = [...new Set([...importedWeightDates, ...added])].filter((d) => d >= cutoff);
    writeLS(weightsKey(side, uid), JSON.stringify(keep));
  }
}

// Syncs while the app is open: once on launch, when it comes back to the
// foreground (at most every 15 minutes), and straight after connecting.
// `enabled` is false while a coach is "viewing as" a client, so the
// coach's own phone never syncs into the client's records.
export function useAppleHealthSync(side, target, enabled) {
  const targetRef = useRef(target);
  targetRef.current = target;
  const uid = target?.uid;
  useEffect(() => {
    if (!enabled || !uid || !appleHealthAvailable()) return;
    let running = false;
    let lastRun = 0;
    const run = async (force) => {
      if (running || !isAppleHealthOn(side, uid)) return;
      if (!force && Date.now() - lastRun < 15 * 60 * 1000) return;
      running = true;
      lastRun = Date.now();
      try {
        await runAppleHealthSync(side, targetRef.current);
      } catch (err) {
        console.error("Apple Health sync", err);
      } finally {
        running = false;
      }
    };
    run(true);
    const onVisible = () => document.visibilityState === "visible" && run(false);
    const onChanged = () => run(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("apexAppleHealthChanged", onChanged);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("apexAppleHealthChanged", onChanged);
    };
  }, [side, uid, enabled]);
}
