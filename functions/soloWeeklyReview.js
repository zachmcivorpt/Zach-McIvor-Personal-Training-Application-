// Train Solo Sunday performance review push (#236). The review itself is
// worked out in the app from the member's own logs (SoloWeekRecapScreen);
// this only tells them it's ready, with their week's real numbers.
const { dateKeyInTz, weekKey } = require("./soloPartners");

const DEFAULT_TZ = "Australia/Sydney";

// Sessions and PRs in the member's current week (Mon–Sun, their time zone).
function weekStats(logs = [], tz = DEFAULT_TZ, nowMs = Date.now()) {
  const wk = weekKey(dateKeyInTz(nowMs, tz));
  let sessions = 0;
  let prs = 0;
  for (const log of logs) {
    const at = Number(log.date) || Date.parse(log.date) || 0;
    if (!at || weekKey(dateKeyInTz(at, tz)) !== wk) continue;
    sessions += 1;
    for (const e of log.entries || []) for (const s of e.sets || []) if (s.isPR) prs += 1;
  }
  return { sessions, prs };
}

function reviewPushText({ sessions = 0, prs = 0, firstName = "" }) {
  const title = "Your weekly review is ready";
  if (!sessions) return { title, body: "A new week starts tomorrow. Open your review for next week's focus." };
  const s = `${sessions} session${sessions === 1 ? "" : "s"}`;
  const p = prs > 0 ? ` and ${prs} PR${prs === 1 ? "" : "s"}` : "";
  const who = firstName ? `Nice work, ${firstName}: ` : "Nice work: ";
  return { title, body: `${who}${s}${p} this week. See your progress and next week's focus.` };
}

module.exports = { weekStats, reviewPushText };
