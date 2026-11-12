// Coach video feedback (#220): what changed in a client's weekly check-in
// since their previous one of the same form. Shared by the coach's
// workspace (Check-in tab) and the client's film page, so both read the
// same comparison. Rating questions (1–5) get a verdict; a question can
// say higher is worse (stress, soreness…) — set in Library → Forms, or
// guessed from the wording when the coach hasn't set it.
const HIGHER_IS_WORSE_WORDS = /stress|sore|pain|fatigue|tired|exhaust|hunger|hungry|craving|anxi|bloat|injur|ache|overwhelm/i;

export function higherIsWorse(q) {
  if (typeof q?.higherIsWorse === "boolean") return q.higherIsWorse;
  return HIGHER_IS_WORSE_WORDS.test(q?.label || "");
}

function num(v) {
  const n = Number(v);
  return v === "" || v === null || v === undefined || !Number.isFinite(n) ? null : n;
}

// The client's previous response to the same form (before this one).
export function previousResponse(responses, response) {
  if (!response) return null;
  return (
    (responses || [])
      .filter((r) => r.id !== response.id && r.formId === response.formId && r.date < response.date)
      .sort((a, b) => b.date - a.date)[0] || null
  );
}

// -> { previous, ratings: [{ id, label, now, prev, delta, verdict }],
//      keyChanges (worse first, biggest first), answers: [{ id, label, type, value }] }
// verdict: "better" | "worse" | "same" | "new" (no previous answer).
export function checkinChanges(form, response, responses) {
  if (!form || !response) return { previous: null, ratings: [], keyChanges: [], answers: [] };
  const previous = previousResponse(responses, response);
  const ratings = [];
  const answers = [];
  for (const q of form.questions || []) {
    const raw = response.answers?.[q.id];
    if (q.type === "rating") {
      const now = num(raw);
      if (now === null) continue;
      const prev = num(previous?.answers?.[q.id]);
      const delta = prev === null ? null : now - prev;
      let verdict = "new";
      if (delta === 0) verdict = "same";
      else if (delta !== null) verdict = (higherIsWorse(q) ? delta > 0 : delta < 0) ? "worse" : "better";
      ratings.push({ id: q.id, label: q.label || "Rating", now, prev, delta, verdict, higherIsWorse: higherIsWorse(q) });
    } else if (raw !== undefined && raw !== null && raw !== "") {
      const prevNum = q.type === "number" ? num(previous?.answers?.[q.id]) : null;
      answers.push({ id: q.id, label: q.label || "Question", type: q.type, value: raw, prev: prevNum });
    }
  }
  const keyChanges = ratings
    .filter((r) => r.verdict === "worse")
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { previous, ratings, keyChanges, answers };
}

// The few changes worth a client's glance under the video: worse first,
// then better, biggest first.
export function headlineChanges(changes, limit = 3) {
  const rank = { worse: 0, better: 1 };
  return (changes?.ratings || [])
    .filter((r) => r.verdict === "worse" || r.verdict === "better")
    .sort((a, b) => rank[a.verdict] - rank[b.verdict] || Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}
