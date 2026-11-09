// Jarvis mode (#208): what on a client's Training tab needs the coach,
// each with one tap. Built only from the client's own logs and the plateau
// check the page already runs — never invented.

const DAY = 86400000;

export function logHasNotes(log) {
  return !!log.sessionNote || (log.entries || []).some((e) => e.note || e.swapReason);
}

export function logPrCount(log) {
  return (log.entries || []).reduce((a, e) => a + (e.sets || []).filter((s) => s.isPR).length, 0);
}

// Session History filters: all | workouts | cardio | prs | notes
export function filterSessionLogs(logs, filter) {
  if (filter === "workouts") return logs.filter((l) => !l.cardio);
  if (filter === "cardio") return logs.filter((l) => !!l.cardio);
  if (filter === "prs") return logs.filter((l) => !l.cardio && logPrCount(l) > 0);
  if (filter === "notes") return logs.filter((l) => !l.cardio && logHasNotes(l));
  return logs;
}

export function needsYouItems({ logs = [], plateaus = [], now = Date.now() }) {
  const weekAgo = now - 7 * DAY;
  const items = [];
  const recent = logs.filter((l) => l.date >= weekAgo);
  const withNotes = recent.filter((l) => !l.cardio && logHasNotes(l));
  if (withNotes.length > 0) {
    items.push({
      id: "notes",
      tone: "blue",
      title: `${withNotes.length} session${withNotes.length === 1 ? "" : "s"} with client notes this week`,
      detail: withNotes.map((l) => l.dayLabel).filter(Boolean).slice(0, 3).join(", "),
      action: "review",
    });
  }
  plateaus.forEach((p) => {
    items.push({
      id: `plateau:${p.exerciseId}`,
      tone: "red",
      title: `Plateau · ${p.exerciseName}`,
      detail: `${p.sessions} sessions stuck at ~${p.currentVolume} kg volume`,
      action: "program",
    });
  });
  if (logs.length > 0 && recent.length === 0) {
    items.push({ id: "quiet", tone: "white", title: "No sessions logged in 7 days", detail: "Worth a check-in", action: "message" });
  }
  return items;
}
