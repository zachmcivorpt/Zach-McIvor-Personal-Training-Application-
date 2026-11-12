// Coach Overview → Needs attention (#228, owner): a client's program phase
// or meal guide that ends within 4 days, or has ended with nothing after
// it. Dates are compared as plain YYYY-MM-DD keys against the `todayKey`
// given (#210), never the device clock behind its back.
import { mealPlanEndDateKey, isMealPlanEnded } from "../lib/mealPlanEnd";

export const ENDING_SOON_DAYS = 4;
const ENDED_LOOKBACK_DAYS = 14;

function keyToUTC(key) {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
export function daysBetweenKeys(fromKey, toKey) {
  return Math.round((keyToUTC(toKey) - keyToUTC(fromKey)) / 86400000);
}
const fmt = (key) => new Date(keyToUTC(key)).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
const inDays = (n) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

export function phaseAlert(client, phases, todayKey) {
  const list = (phases || []).filter((p) => p.startDate).slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
  const current = list.find((p) => p.startDate <= todayKey && (!p.endDate || p.endDate >= todayKey));
  const hasNextAfter = (key) => list.some((p) => p.startDate > key);
  if (current) {
    if (!current.endDate || hasNextAfter(current.endDate)) return null;
    const left = daysBetweenKeys(todayKey, current.endDate);
    if (left > ENDING_SOON_DAYS) return null;
    return {
      id: `phase-${client.id}-${current.endDate}`,
      client,
      kind: "phase",
      tab: "training",
      title: "Program phase ending",
      detail: `${current.name || "Their phase"} ends ${inDays(left)} (${fmt(current.endDate)}) — set up their next phase.`,
    };
  }
  if (hasNextAfter(todayKey)) return null;
  const ended = list.filter((p) => p.endDate && p.endDate < todayKey).pop();
  if (!ended || daysBetweenKeys(ended.endDate, todayKey) > ENDED_LOOKBACK_DAYS) return null;
  return {
    id: `phase-${client.id}-${ended.endDate}`,
    client,
    kind: "phase",
    tab: "training",
    title: "Program phase ended",
    detail: `${ended.name || "Their phase"} ended ${fmt(ended.endDate)} and nothing is scheduled after it — set up their next phase.`,
  };
}

export function mealPlanAlert(client, plan, todayKey) {
  const end = mealPlanEndDateKey(plan);
  if (!end) return null;
  if (isMealPlanEnded(plan, todayKey)) {
    return {
      id: `mealplan-${client.id}-${end}`,
      client,
      kind: "mealPlan",
      tab: "nutrition",
      title: "Meal guide ended",
      detail: `Ended ${fmt(end)} — it no longer shows in their app. Build their next one.`,
    };
  }
  const left = daysBetweenKeys(todayKey, end);
  if (left > ENDING_SOON_DAYS) return null;
  return {
    id: `mealplan-${client.id}-${end}`,
    client,
    kind: "mealPlan",
    tab: "nutrition",
    title: "Meal guide ending",
    detail: `Ends ${inDays(left)} (${fmt(end)}) — build or duplicate their next one before they run out.`,
  };
}

// The newest scheduled session in the last week that wasn't logged — older
// misses aren't worth a follow-up any more (#228: one from months ago
// stayed in Needs attention for good).
export const MISSED_LOOKBACK_DAYS = 7;
export function recentMissedSession(scheduled, loggedDateKeys, todayKey) {
  return (
    (scheduled || [])
      .filter((w) => w.date < todayKey && daysBetweenKeys(w.date, todayKey) <= MISSED_LOOKBACK_DAYS && !loggedDateKeys.has(w.date))
      .sort((a, b) => b.date.localeCompare(a.date))[0] || null
  );
}
