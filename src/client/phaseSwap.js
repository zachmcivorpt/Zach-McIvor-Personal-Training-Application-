// "Swap in training phase" (#231, coach in View as Client): replace one
// exercise in the client's current phase for good, the way Trainerize's
// "Edit in training phase" does. Two records hold it:
//  - the phase itself (clientPhases: weeks[0].days[].exercises), every day
//    with this session's name;
//  - the days already put on the calendar from that phase
//    (scheduledWorkouts are standalone copies, see deleteClientPhase), from
//    this session's day to the phase's end, with the same name.
// Logged sessions are never touched. Pure, tested (phaseSwap.test.js).

// The phase that covers `dateKey` (start ≤ date ≤ end, open-ended allowed);
// the latest-starting one if several overlap.
export function phaseForDate(phases = [], dateKey) {
  return (
    [...phases]
      .filter((p) => p?.startDate && p.startDate <= dateKey && (!p.endDate || p.endDate >= dateKey))
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0] || null
  );
}

function swapIn(exercises = [], fromId, toId) {
  let changed = false;
  const next = exercises.map((e) => {
    if (e?.exerciseId !== fromId) return e;
    changed = true;
    return { ...e, exerciseId: toId };
  });
  return changed ? next : null;
}

// Returns { phaseId, weeks, scheduled: [entry with new exercises] } or null
// when the phase holds nothing to change.
export function planPhaseSwap({ phases, scheduled = [], dateKey, label, fromId, toId }) {
  if (!fromId || !toId || fromId === toId || !dateKey) return null;
  const phase = phaseForDate(phases, dateKey);
  if (!phase) return null;
  const week = phase.weeks?.[0];
  const days = week?.days || [];
  let phaseChanged = false;
  const nextDays = days.map((d) => {
    if (label && d?.label !== label) return d;
    const ex = swapIn(d?.exercises, fromId, toId);
    if (!ex) return d;
    phaseChanged = true;
    return { ...d, exercises: ex };
  });
  const end = phase.endDate || "9999-12-31";
  const scheduledChanges = [];
  for (const w of scheduled) {
    if (!w?.date || w.date < dateKey || w.date < phase.startDate || w.date > end) continue;
    if (label && w.label !== label) continue;
    const ex = swapIn(w.exercises, fromId, toId);
    if (ex) scheduledChanges.push({ ...w, exercises: ex });
  }
  if (!phaseChanged && !scheduledChanges.length) return null;
  return {
    phaseId: phase.id,
    weeks: phaseChanged ? [{ ...(week || { id: "w1", label: "Week 1" }), days: nextDays }] : null,
    scheduled: scheduledChanges,
  };
}
