import { clientLook } from "./clientLook";
// Date maths for the client Training tab's glass design (#271).
// Every function takes the "today" it is given (a YYYY-MM-DD key), never
// the device clock behind its back.

function parseKey(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Monday–Sunday of the week holding `todayKey`, as { key, date, isToday }.
export function weekDays(todayKey) {
  const today = parseKey(todayKey);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = toKey(d);
    return { key, date: d, isToday: key === todayKey };
  });
}

// How many weeks a phase spans (start to end, inclusive) and which one
// `todayKey` falls in (0-based; -1 before it starts, `count` after it
// ends). No end date → null: an open-ended phase has no week bars.
export function phaseWeeks(startDate, endDate, todayKey) {
  if (!startDate || !endDate) return null;
  const start = parseKey(startDate);
  const end = parseKey(endDate);
  const days = Math.round((end - start) / 86400000) + 1;
  if (!(days > 0)) return null;
  const count = Math.ceil(days / 7);
  const sinceStart = Math.round((parseKey(todayKey) - start) / 86400000);
  const current = sinceStart < 0 ? -1 : Math.min(count, Math.floor(sinceStart / 7));
  return { count, current };
}

// #279: the Training tab uses the client app's card (clientLook) so it reads
// like Home.
export function trainingGlass(dark) {
  return clientLook(dark).card;
}

