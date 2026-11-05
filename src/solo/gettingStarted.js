// Getting Started guide for Free members (#180).
//
// Shown by itself once ever: the first time a Free member with no logged
// sessions lands on My Training. It's marked seen the moment it shows — on
// the account (soloUsers/{uid}.gettingStarted.seenAt) and on this phone —
// so skipping, finishing, leaving, a refresh, a reinstall or another phone
// never bring it back. Profile > Getting Started reopens it any time.

export const GETTING_STARTED_STEPS = [
  {
    id: "session",
    title: "Create a session",
    body: "Build a workout once and reuse it. Name it, add exercises, set your sets and reps — or tap Quick session and log as you go.",
    points: ["My Training → Build a session", "Add exercises from the library", "Save it to reuse any time"],
    tryLabel: "Build a session",
    target: { path: "/solo/session-builder" },
  },
  {
    id: "calendar",
    title: "Plan your week",
    body: "Put sessions on the days that suit you. Your calendar shows what's on today and what's coming up.",
    points: ["Plan a saved session on a day", "Calendar → hold a session, drag it to another day", "Missed one? Move it to today or skip it"],
    tryLabel: "Open Calendar",
    target: { path: "/solo/home", state: { soloTab: "calendar" } },
  },
  {
    id: "log",
    title: "Log your workout",
    body: "Start a session and enter reps and kg for every set. The rest timer runs between sets, and your workout is kept on your phone until you finish.",
    points: ["Reps and kg for each set", "Rest timer between sets", "Complete to save it to your history"],
    tryLabel: "Back to My Training",
    target: { path: "/solo/home", state: { soloTab: "training" } },
  },
  {
    id: "library",
    title: "Exercise library",
    body: "Search the exercise library when you build a session. Swap any exercise for another that works the same muscles.",
    points: ["Search by name", "Swap an exercise in a session", "Warm-up and plate helper for your lifts"],
    tryLabel: "Browse exercises",
    target: { path: "/solo/session-builder" },
  },
  {
    id: "progress",
    title: "Track your progress",
    body: "Every session you complete builds your history. See what you've trained, log your weight and add progress photos.",
    points: ["Session history", "Muscle map: trained and ready", "Weigh-ins and progress photos"],
    tryLabel: "Open Progress",
    target: { path: "/solo/home", state: { soloTab: "progress" } },
  },
];

export const gettingStartedKey = (uid) => `apexSoloGettingStarted:${uid}`;

export function seenOnPhone(uid) {
  try {
    return !!(uid && localStorage.getItem(gettingStartedKey(uid)));
  } catch {
    return false;
  }
}

export function markSeenOnPhone(uid) {
  try {
    if (uid) localStorage.setItem(gettingStartedKey(uid), String(Date.now()));
  } catch {
    // Storage blocked: the account flag still records it.
  }
}

// Show it by itself? Only for a Free member (plan confirmed) who has never
// seen it on any phone and hasn't logged a session yet, once their lists
// have loaded (so a member with history never sees it flash up).
export function shouldAutoShowGettingStarted({ profile, tier, entitlementReady, listsReady, logCount }) {
  if (!profile?.id || !entitlementReady || !listsReady) return false;
  if (tier !== "free") return false;
  if (profile.gettingStarted?.seenAt) return false;
  if (seenOnPhone(profile.id)) return false;
  return logCount === 0;
}

// Where to open it: the saved step if it was left part-way, else the start.
export function startStep(profile) {
  const gs = profile?.gettingStarted;
  if (!gs || gs.finishedAt) return 0;
  const n = Number(gs.step);
  return Number.isInteger(n) && n >= 0 && n < GETTING_STARTED_STEPS.length ? n : 0;
}
