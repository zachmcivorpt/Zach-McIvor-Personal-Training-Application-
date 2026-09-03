// Pure functions computing a challenge's leaderboard from data that
// already exists (workout logs, weigh-ins, check-in responses) — no new
// per-entry tracking needed, the challenge just windows and ranks it.

export const CHALLENGE_METRICS = [
  { id: "workouts", label: "Most workouts completed", higherIsBetter: true, unit: "" },
  { id: "volume", label: "Most total volume lifted (kg)", higherIsBetter: true, unit: "kg" },
  { id: "weightLoss", label: "Most weight lost (kg)", higherIsBetter: true, unit: "kg" },
  { id: "checkins", label: "Most check-ins submitted", higherIsBetter: true, unit: "" },
];

function inRange(dateMs, startKey, endKey) {
  const d = new Date(dateMs).toISOString().slice(0, 10);
  return d >= startKey && d <= endKey;
}

function scoreForClient(metric, clientId, { workoutLogs, weighIns, formResponses }, startKey, endKey) {
  if (metric === "workouts") {
    return (workoutLogs[clientId] || []).filter((l) => inRange(l.date, startKey, endKey)).length;
  }
  if (metric === "volume") {
    const logs = (workoutLogs[clientId] || []).filter((l) => inRange(l.date, startKey, endKey));
    let total = 0;
    logs.forEach((l) => l.entries.forEach((e) => e.sets.forEach((s) => (total += (s.weight || 0) * (s.reps || 0)))));
    return Math.round(total);
  }
  if (metric === "weightLoss") {
    const weighs = (weighIns[clientId] || []).filter((w) => inRange(w.date, startKey, endKey)).sort((a, b) => a.date - b.date);
    if (weighs.length < 2) return 0;
    const loss = weighs[0].weight - weighs[weighs.length - 1].weight;
    return Math.round(loss * 10) / 10;
  }
  if (metric === "checkins") {
    return (formResponses[clientId] || []).filter((r) => inRange(r.date, startKey, endKey)).length;
  }
  return 0;
}

// Returns a ranked array: [{ clientId, value, rank }], best first.
export function computeLeaderboard(challenge, db) {
  const data = { workoutLogs: db.workoutLogs || {}, weighIns: db.weighIns || {}, formResponses: db.formResponses || {} };
  const rows = (challenge.participantIds || []).map((clientId) => ({
    clientId,
    value: scoreForClient(challenge.metric, clientId, data, challenge.startDate, challenge.endDate),
  }));
  rows.sort((a, b) => b.value - a.value);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

export function challengeStatus(challenge, todayKey) {
  if (todayKey < challenge.startDate) return "upcoming";
  if (todayKey > challenge.endDate) return "ended";
  return "active";
}
