// When a coach's meal guide finishes. It runs from its startDate for as
// many weeks as its days cover (days without a weekIndex — plans saved
// before weeks existed — are grouped into blocks of 7 by position, the same
// rule the client's "Week X of Y" and the coach dashboard use). A plan with
// no startDate (older plans) never ends on its own.
// functions/mealPlanEnd.js is the same rule for the daily coach reminder.
import { localDateKey } from "./dateKey";

export function mealPlanWeeksCount(plan) {
  if (!plan?.days?.length) return 1;
  return Math.max(...plan.days.map((d, i) => d.weekIndex ?? Math.floor(i / 7))) + 1;
}

// The plan's last day, YYYY-MM-DD.
export function mealPlanEndDateKey(plan) {
  if (!plan?.startDate || !plan.days?.length) return null;
  const [y, m, d] = plan.startDate.split("-").map(Number);
  return localDateKey(new Date(y, m - 1, d + mealPlanWeeksCount(plan) * 7 - 1));
}

export function isMealPlanEnded(plan, todayKey = localDateKey()) {
  const end = mealPlanEndDateKey(plan);
  return !!end && todayKey > end;
}
