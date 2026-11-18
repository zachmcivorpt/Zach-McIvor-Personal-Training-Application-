// The coached client app's look (#279, owner's mock-up 2026-11-18): soft
// grey page, white frosted-glass cards, black type and black accents in
// light mode; black page, charcoal glass and white accents in dark mode.
// Pure helpers only — the parts that use them are in ClientLook.jsx. Every
// figure here comes from the client's own logs; date maths take the
// `todayKey` given (#210).
import { localDateKey } from "../lib/dateKey";
import { hasFoodLogged } from "../lib/nutritionLog";
import { isTrainingSession } from "../coach/commandCentre";

export function clientLook(dark) {
  return dark
    ? {
        dark: true,
        page: "#070708",
        pageImage: "radial-gradient(120% 60% at 100% 0%, rgba(255,255,255,0.05), transparent 60%)",
        // #299 frosted glass (owner's reference, 2026-11-18): charcoal glass
        // with a top-down sheen and a lit rim; same colours, sizes, layout.
        card: { backgroundColor: "rgba(32,32,35,0.58)", backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.035) 42%, rgba(255,255,255,0.02) 100%)", border: "1px solid rgba(255,255,255,0.13)", boxShadow: "0 22px 44px -26px rgba(0,0,0,0.95), inset 0 1px 0 rgba(255,255,255,0.2), inset 1px 0 0 rgba(255,255,255,0.04)", backdropFilter: "blur(26px) saturate(170%)", WebkitBackdropFilter: "blur(26px) saturate(170%)" },
        tile: { backgroundColor: "rgba(34,34,37,0.58)", backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.03) 55%, rgba(255,255,255,0.02) 100%)", border: "1px solid rgba(255,255,255,0.13)", boxShadow: "0 14px 28px -18px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.2)", backdropFilter: "blur(24px) saturate(170%)", WebkitBackdropFilter: "blur(24px) saturate(170%)" },
        ink: "#FFFFFF",
        onInk: "#0A0A0B",
        muted: "rgba(255,255,255,0.6)",
        faint: "rgba(255,255,255,0.35)",
        track: "rgba(255,255,255,0.12)",
        line: "rgba(255,255,255,0.08)",
      }
    : {
        dark: false,
        // White, so it flows into the white top strip (#283, owner). Faint
        // grey glows lower down give the glass something to show over.
        page: "#FFFFFF",
        pageImage:
          "radial-gradient(60% 30% at 0% 45%, rgba(160,160,170,0.2), transparent 70%), radial-gradient(60% 30% at 100% 75%, rgba(160,160,170,0.18), transparent 70%), radial-gradient(50% 22% at 20% 100%, rgba(160,160,170,0.14), transparent 70%)",
        // #299 frosted glass (owner's reference): soft grey glass with a white
        // top-down sheen, a white rim and a wide soft shadow. Card greys
        // softened (#300, owner: "too much" on the big Nutrition cards).
        card: { backgroundColor: "rgba(246,246,249,0.55)", backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(250,250,252,0.4) 50%, rgba(242,242,246,0.45) 100%)", border: "1px solid rgba(255,255,255,0.95)", boxShadow: "0 0 0 0.5px rgba(10,10,11,0.07), 0 16px 32px -16px rgba(20,20,30,0.24), inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(10,10,11,0.03)", backdropFilter: "blur(26px) saturate(180%)", WebkitBackdropFilter: "blur(26px) saturate(180%)" },
        tile: { backgroundColor: "rgba(236,236,240,0.62)", backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(225,225,230,0.8) 100%)", border: "1px solid rgba(255,255,255,0.95)", boxShadow: "0 0 0 0.5px rgba(10,10,11,0.07), 0 12px 22px -12px rgba(20,20,30,0.3), inset 0 1px 0 rgba(255,255,255,1)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)" },
        ink: "#0A0A0B",
        onInk: "#FFFFFF",
        muted: "rgba(10,10,11,0.55)",
        faint: "rgba(10,10,11,0.32)",
        track: "rgba(10,10,11,0.1)",
        line: "rgba(10,10,11,0.07)",
      };
}

export function greetingFor(hour) {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12);
  dt.setDate(dt.getDate() + n);
  return localDateKey(dt);
}

// One focus line for the week, from the client's own week so far (Monday →
// today): protein days missed with days still left, else training sessions
// still to do. Null when there's nothing true to say.
export function weekFocus({ nutritionLogs, proteinTarget, scheduledKeys = [], doneKeys = new Set(), todayKey }) {
  const [y, m, d] = todayKey.split("-").map(Number);
  const dow = (new Date(y, m - 1, d, 12).getDay() + 6) % 7; // 0 = Monday
  const monday = addDays(todayKey, -dow);
  const daysLeft = 7 - dow; // today included
  const byDate = Object.fromEntries((nutritionLogs || []).map((n) => [n.date, n]));
  const past = Array.from({ length: dow }, (_, i) => addDays(monday, i));
  if (proteinTarget > 0 && dow > 0) {
    const hits = past.filter((k) => hasFoodLogged(byDate[k]) && (Number(byDate[k].protein) || 0) >= proteinTarget * 0.9).length;
    if (hits < dow) {
      return { kind: "protein", text: `Hit your protein goal ${daysLeft} more day${daysLeft === 1 ? "" : "s"} this week.` };
    }
  }
  const sunday = addDays(monday, 6);
  const left = [...new Set(scheduledKeys)].filter((k) => k >= todayKey && k <= sunday && !doneKeys.has(k)).length;
  if (left > 0) return { kind: "training", text: `${left} training session${left === 1 ? "" : "s"} left this week — keep it going.` };
  return null;
}

// #290 (owner: "the streak must be accurate"): ONE streak for the client
// app — Home's card and Progress's "Current Streak" both use this. Scheduled
// TRAINING sessions done in a row, newest first (cardio / warm-up only days
// don't count, #269). A session is done when a non-cardio log is for it: the
// log's scheduledDate, else the log's own day with the same name (the same
// rule as Home's "Completed"). Rest days never break it; today's session
// doesn't break it until the day is over; a missed past session ends it.
export function sessionStreak({ logs = [], scheduled = [], exercisesById = {}, todayKey }) {
  const byDate = {};
  for (const w of scheduled || []) {
    if (!w?.date || w.date > todayKey || !isTrainingSession(w, exercisesById)) continue;
    (byDate[w.date] = byDate[w.date] || []).push(w);
  }
  const strength = (logs || []).filter((l) => l && !l.cardio);
  const doneOn = (dateKey) =>
    byDate[dateKey].some((w) =>
      strength.some((l) => (l.scheduledDate ? l.scheduledDate === dateKey : localDateKey(new Date(l.date)) === dateKey && (!w.label || !l.dayLabel || l.dayLabel === w.label)))
    );
  let n = 0;
  for (const dateKey of Object.keys(byDate).sort().reverse()) {
    if (doneOn(dateKey)) n += 1;
    else if (dateKey !== todayKey) break;
  }
  return n;
}
