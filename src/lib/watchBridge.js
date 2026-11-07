// Apple Watch workout logging (REGRESSION_TESTS.md #189).
//
// The Watch app (ios/ApexWatch) has no web view and no Firebase: the phone's
// workout screen stays the one place a workout lives. This module is the
// page's side of the bridge:
//
//   page  → iPhone app → Watch : postMessage({ action: "workout", workout })
//                                 every time the workout changes (sets,
//                                 rest), and { action: "clear" } when it ends.
//   Watch → iPhone app → page  : window "apexWatch" CustomEvent per action
//                                 ({ id, type: logSet | startRest | skipRest |
//                                 addSet | requestState, ... }); the page
//                                 applies it exactly as if the client had
//                                 typed it, then acks the id.
//
// The iPhone app keeps every Watch action until the page acks it (the phone
// can be locked with the page asleep), and re-sends unacked ones when the page
// posts a workout again — so an action can arrive twice. `alreadyApplied`
// drops repeats (kept on the phone, so a reload doesn't re-apply an "add set").
// Everywhere without the native handler (browsers, Android, older iPhone
// builds) every function here does nothing.

const HANDLER = "apexWatch";
const SEEN_KEY = "apexWatchSeenActions";
const SEEN_MAX = 200;

function handler() {
  return typeof window !== "undefined" ? window.webkit?.messageHandlers?.[HANDLER] || null : null;
}

export function watchBridgeAvailable() {
  return !!handler();
}

function post(message) {
  const h = handler();
  if (!h) return;
  try {
    h.postMessage(message);
  } catch {}
}

function toNumber(v) {
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// What the Watch shows: plain JSON, numbers as numbers, nothing it can't
// display. `sets` are the same rows the phone shows (planned + added).
export function buildWatchWorkout({ sessionId, label, exercises, rest }) {
  return {
    v: 1,
    sessionId: String(sessionId || label || "workout"),
    label: label || "Workout",
    exercises: (exercises || []).map((ex) => ({
      id: ex.id,
      name: ex.name || "Exercise",
      target: ex.target || "",
      timed: !!ex.timed,
      restSeconds: Number.isFinite(Number(ex.restSeconds)) ? Number(ex.restSeconds) : 90,
      sets: (ex.rows || []).map((row, i) => {
        const prev = (ex.previousSets || [])[i] || null;
        return {
          index: i,
          reps: toNumber(row.reps),
          weight: toNumber(row.weight),
          done: !!row.completed,
          pr: !!row.isPR,
          prevReps: prev ? toNumber(prev.reps) : null,
          prevWeight: prev ? toNumber(prev.weight) : null,
        };
      }),
    })),
    // Wall-clock end (the Watch has its own clock), or null when not resting.
    rest: rest && rest.endsAt ? { endsAt: Math.round(rest.endsAt), total: rest.total || 0, label: rest.label || "" } : null,
  };
}

export function sendWorkoutToWatch(workout) {
  post({ action: "workout", workout });
}

export function clearWatchWorkout() {
  post({ action: "clear" });
}

export function ackWatchAction(id) {
  if (id) post({ action: "ack", id: String(id) });
}

function readSeen() {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

// True if this action id was applied before (and records it if not).
export function alreadyApplied(id) {
  if (!id) return false;
  const seen = readSeen();
  if (seen.includes(id)) return true;
  seen.push(id);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen.slice(-SEEN_MAX)));
  } catch {}
  return false;
}

export function onWatchAction(listener) {
  if (typeof window === "undefined") return () => {};
  const fn = (e) => {
    const detail = e?.detail;
    if (detail && typeof detail === "object" && typeof detail.type === "string") listener(detail);
  };
  window.addEventListener("apexWatch", fn);
  return () => window.removeEventListener("apexWatch", fn);
}

// Applies a Watch "logSet" to the session's log (pure). Returns the new log
// and the set's index, or null if the action is unusable. Reps are required
// (as on the phone); a blank weight is bodyweight. Rows the Watch can see
// but the log doesn't hold yet (planned, untouched) are filled in like
// WorkoutSession.setField does.
export function applyWatchSet(activeLog, exerciseId, setIndex, { reps, weight }) {
  const idx = Number(setIndex);
  const r = toNumber(reps);
  const w = toNumber(weight);
  if (!exerciseId || !Number.isInteger(idx) || idx < 0 || idx > 49) return null;
  if (r == null || r < 0 || r > 9999 || !Number.isInteger(r)) return null;
  if (w != null && (w < 0 || w > 2000)) return null;
  const arr = [...((activeLog || {})[exerciseId] || [])];
  while (arr.length <= idx) arr.push({ setNumber: arr.length + 1, weight: "", reps: "", completed: false });
  arr[idx] = { ...arr[idx], reps: String(r), weight: w == null || w === 0 ? "" : String(w) };
  return { log: { ...(activeLog || {}), [exerciseId]: arr }, index: idx };
}
