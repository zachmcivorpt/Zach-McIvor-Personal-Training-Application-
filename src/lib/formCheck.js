// Form-check videos: a client films a set from their workout and it goes to
// the coach in chat, tagged with the exercise and set; the coach's reply is
// linked back to that exercise (message.replyTo) and shows next to it the
// next time the client does it.

// The set a form check is about: the last one with reps entered, else the
// first set.
export function formCheckSet(rows) {
  const list = rows || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const reps = Number(list[i]?.reps);
    if (list[i]?.reps !== "" && Number.isFinite(reps) && reps > 0) {
      const weight = Number(list[i].weight);
      return { setNumber: i + 1, reps, weight: Number.isFinite(weight) && weight > 0 ? weight : 0 };
    }
  }
  return { setNumber: 1, reps: null, weight: 0 };
}

export function formCheckLabel(fc) {
  if (!fc) return "";
  const load = fc.reps ? (fc.weight > 0 ? ` · ${fc.weight}kg × ${fc.reps}` : ` · ${fc.reps} reps`) : "";
  return `${fc.exerciseName} · Set ${fc.setNumber}${load}`;
}

export function formCheckMessageText(fc) {
  return `Form check: ${formCheckLabel(fc)}`;
}

// The coach's most recent reply about this exercise (thread is oldest first).
export function latestFormFeedback(thread, exerciseId) {
  const list = thread || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (m.from === "coach" && m.replyTo?.exerciseId === exerciseId) return m;
  }
  return null;
}
