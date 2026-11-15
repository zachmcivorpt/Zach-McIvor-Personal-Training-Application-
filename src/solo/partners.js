// Train Solo training partners (#234): the Team week streak, worked out on
// the phone from both members' server-written activity docs. Keep the week
// and streak maths in step with functions/soloPartners.js
// (functions/soloPartners.test.js checks both agree).

export const MAX_PARTNERS = 4;
export const PENDING_PARTNER_CODE_KEY = "apexSoloPartnerCode";
const DEFAULT_TARGET = 3;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I

const pad = (n) => String(n).padStart(2, "0");

export function weekKey(dateKey) {
  const [y, m, d] = String(dateKey).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function shiftWeek(key, weeks) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + weeks * 7));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function weekMet(w) {
  return !!w && Number(w.done) >= Math.max(1, Number(w.target) || DEFAULT_TARGET);
}

// Consecutive Team weeks (both hit their own target), only since pairing.
// This week counts once both have met it; until then it's the run that
// ended last week.
export function teamStreak(weeksA, weeksB, currentWeek, sinceWeek) {
  const met = (k) => weekMet(weeksA?.[k]) && weekMet(weeksB?.[k]);
  let k = met(currentWeek) ? currentWeek : shiftWeek(currentWeek, -1);
  let n = 0;
  while (k >= (sinceWeek || currentWeek) && met(k)) {
    n += 1;
    k = shiftWeek(k, -1);
  }
  return n;
}

// One member's week for display: done / target, falling back to their
// current target when they haven't logged this week yet.
export function weekFor(activity, wk) {
  const w = activity?.weeks?.[wk];
  const target = Number(w?.target) || Number(activity?.target) || DEFAULT_TARGET;
  return { done: Number(w?.done) || 0, target };
}

// Everything the Team week row shows for one pair. `sinceWeek` is the
// Monday of the week they paired.
export function teamWeekView({ mine, theirs, todayKey, pairedAt }) {
  const wk = weekKey(todayKey);
  const since = pairedAt ? weekKey(localKey(pairedAt)) : wk;
  const me = weekFor(mine, wk);
  const them = weekFor(theirs, wk);
  const metThisWeek = me.done >= me.target && them.done >= them.target;
  return { me, them, metThisWeek, streak: teamStreak(mine?.weeks, theirs?.weeks, wk, since) };
}

function localKey(ms) {
  const d = new Date(Number(ms));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const pairIdFor = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);

export function makePartnerCode(random = Math.random) {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(random() * CODE_CHARS.length)];
  return s;
}

// What someone typed or pasted (a code, or the whole invite link) → a code.
export function normalisePartnerCode(input) {
  const raw = String(input || "").trim();
  const fromLink = raw.match(/\/join\/([A-Za-z0-9]+)/);
  const code = (fromLink ? fromLink[1] : raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length >= 6 && code.length <= 10 ? code : "";
}

export function inviteLink(code, origin = typeof window !== "undefined" ? window.location.origin : "") {
  return `${origin}/solo/join/${code}`;
}
