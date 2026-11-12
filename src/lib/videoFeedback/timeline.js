// Coach video feedback (#219): the edit timeline as plain data.
//
// A recording ("source") is never changed. The timeline is a list of
// segments, each a window [in, out) of one source in seconds. Trimming
// moves a window's edges, splitting makes two windows, removing a middle
// section is split + delete, rearranging reorders the list. The final video
// is rendered from this list only when the coach publishes (render.js).
// Every function here returns a new list and never mutates its input, so
// undo is just "go back to the previous list".

export const MIN_SEGMENT_SEC = 0.3;
export const MAX_HISTORY = 50;

let idCounter = 0;
export function newLocalId(prefix = "seg") {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const round3 = (n) => Math.round(n * 1000) / 1000;

export function segmentLength(seg) {
  return Math.max(0, seg.out - seg.in);
}

export function totalDuration(segments) {
  return round3((segments || []).reduce((sum, s) => sum + segmentLength(s), 0));
}

// The whole of a new recording as one segment.
export function segmentForSource(source) {
  return { id: newLocalId("seg"), sourceId: source.id, in: 0, out: round3(source.duration) };
}

// Move a segment's start/end. Clamped to its recording and to a minimum
// length so a handle can never cross the other one.
export function trimSegment(segments, segId, { in: inPoint, out: outPoint }, sources) {
  return segments.map((s) => {
    if (s.id !== segId) return s;
    const max = sources?.[s.sourceId]?.duration ?? s.out;
    let nextIn = inPoint === undefined ? s.in : Math.max(0, Math.min(inPoint, max));
    let nextOut = outPoint === undefined ? s.out : Math.max(0, Math.min(outPoint, max));
    if (inPoint !== undefined && nextIn > nextOut - MIN_SEGMENT_SEC) nextIn = Math.max(0, nextOut - MIN_SEGMENT_SEC);
    if (outPoint !== undefined && nextOut < nextIn + MIN_SEGMENT_SEC) nextOut = Math.min(max, nextIn + MIN_SEGMENT_SEC);
    return { ...s, in: round3(nextIn), out: round3(nextOut) };
  });
}

// Split a segment `offset` seconds into it. Returns the list unchanged when
// either half would be shorter than MIN_SEGMENT_SEC.
export function splitSegment(segments, segId, offset) {
  const idx = segments.findIndex((s) => s.id === segId);
  if (idx === -1) return segments;
  const s = segments[idx];
  const cut = round3(s.in + offset);
  if (cut - s.in < MIN_SEGMENT_SEC || s.out - cut < MIN_SEGMENT_SEC) return segments;
  const first = { ...s, out: cut };
  const second = { id: newLocalId("seg"), sourceId: s.sourceId, in: cut, out: s.out };
  return [...segments.slice(0, idx), first, second, ...segments.slice(idx + 1)];
}

export function removeSegment(segments, segId) {
  return segments.filter((s) => s.id !== segId);
}

export function moveSegment(segments, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= segments.length) return segments;
  const to = Math.max(0, Math.min(segments.length - 1, toIndex));
  const next = segments.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(to, 0, item);
  return next;
}

// Re-record a section: the new recording takes the old segment's place.
export function replaceSegment(segments, segId, newSegments) {
  const idx = segments.findIndex((s) => s.id === segId);
  if (idx === -1) return [...segments, ...newSegments];
  return [...segments.slice(0, idx), ...newSegments, ...segments.slice(idx + 1)];
}

export function insertSegments(segments, index, newSegments) {
  const at = index === undefined || index === null ? segments.length : Math.max(0, Math.min(segments.length, index));
  return [...segments.slice(0, at), ...newSegments, ...segments.slice(at)];
}

// Timeline time -> which segment and where in its recording.
export function locate(segments, t) {
  let start = 0;
  for (let i = 0; i < segments.length; i++) {
    const len = segmentLength(segments[i]);
    if (t < start + len || i === segments.length - 1) {
      const offset = Math.max(0, Math.min(len, t - start));
      return { index: i, segment: segments[i], start, offset, sourceTime: round3(segments[i].in + offset) };
    }
    start += len;
  }
  return null;
}

export function segmentStart(segments, segId) {
  let start = 0;
  for (const s of segments) {
    if (s.id === segId) return round3(start);
    start += segmentLength(s);
  }
  return null;
}

// Identifies one exact edit, so a finished render is reused (a failed
// upload retries without rendering again) only while nothing has changed.
export function segmentsHash(segments) {
  return (segments || []).map((s) => `${s.sourceId}@${s.in.toFixed(3)}-${s.out.toFixed(3)}`).join("|");
}

// Recordings no longer used by the timeline or by anything undo could bring
// back — safe to delete from the phone.
export function unusedSourceIds(sources, segments, history) {
  const used = new Set();
  const mark = (list) => (list || []).forEach((s) => used.add(s.sourceId));
  mark(segments);
  (history?.past || []).forEach(mark);
  (history?.future || []).forEach(mark);
  return Object.keys(sources || {}).filter((id) => !used.has(id));
}

// --- undo / redo --------------------------------------------------------
export function emptyHistory() {
  return { past: [], future: [] };
}
export function pushHistory(history, previousSegments) {
  const past = [...(history?.past || []), previousSegments].slice(-MAX_HISTORY);
  return { past, future: [] };
}
export function undo(history, current) {
  const past = history?.past || [];
  if (past.length === 0) return null;
  return { segments: past[past.length - 1], history: { past: past.slice(0, -1), future: [current, ...(history.future || [])] } };
}
export function redo(history, current) {
  const future = history?.future || [];
  if (future.length === 0) return null;
  return { segments: future[0], history: { past: [...(history.past || []), current], future: future.slice(1) } };
}

// --- written coaching overview -----------------------------------------
export const SUMMARY_SECTIONS = [
  { key: "overall", label: "Overall progress", placeholder: "How the week went and what stood out." },
  { key: "nutrition", label: "Nutrition", placeholder: "Calories, protein, consistency…" },
  { key: "training", label: "Training", placeholder: "Sessions, lifts, progression…" },
  { key: "recovery", label: "Recovery & activity", placeholder: "Sleep, steps, energy (optional)" },
  { key: "adjustments", label: "Adjustments made", placeholder: "Any changes to targets or program (optional)" },
];
export const MAX_PRIORITIES = 5;

export function emptySummary() {
  return { overall: "", nutrition: "", training: "", recovery: "", adjustments: "", priorities: ["", "", ""] };
}

export function cleanSummary(summary) {
  const s = summary || {};
  const out = {};
  for (const { key } of SUMMARY_SECTIONS) out[key] = String(s[key] || "").trim().slice(0, 4000);
  out.priorities = (s.priorities || []).map((p) => String(p || "").trim().slice(0, 300)).filter(Boolean).slice(0, MAX_PRIORITIES);
  return out;
}

// Every video goes out with a written overview: at least the overall note.
export function summaryReady(summary) {
  return cleanSummary(summary).overall.length > 0;
}

export function formatClock(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}
