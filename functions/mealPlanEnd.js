// Same rule as src/lib/mealPlanEnd.js (a meal guide runs from startDate for
// as many weeks as its days cover), for the daily coach reminder.

function mealPlanEndDateKey(plan) {
  if (!plan || !plan.startDate || !Array.isArray(plan.days) || plan.days.length === 0) return null;
  const weeks = Math.max(...plan.days.map((d, i) => (d.weekIndex ?? Math.floor(i / 7)))) + 1;
  const [y, m, d] = plan.startDate.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1, d + weeks * 7 - 1));
  return end.toISOString().slice(0, 10);
}

// Days from todayKey to the plan's last day (negative once it's over).
function daysUntilEnd(plan, todayKey) {
  const end = mealPlanEndDateKey(plan);
  if (!end) return null;
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 86400000);
}

// The coach's push for this plan today, or null: 2 days out, the last day,
// and the day after it ended.
function mealPlanReminder(plan, clientName, todayKey) {
  const left = daysUntilEnd(plan, todayKey);
  const name = clientName || "A client";
  if (left === 2) return { title: "Meal guide ending soon", body: `${name}'s meal guide ends in 2 days — build or duplicate their next one.` };
  if (left === 0) return { title: "Meal guide ends today", body: `${name}'s meal guide finishes today — build or duplicate their next one.` };
  if (left === -1) return { title: "Meal guide ended", body: `${name}'s meal guide has ended and no longer shows in their app — build their next one.` };
  return null;
}

module.exports = { mealPlanEndDateKey, daysUntilEnd, mealPlanReminder };
