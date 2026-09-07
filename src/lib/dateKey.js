// Local calendar-day key (YYYY-MM-DD) for a moment in time.
//
// `date.toISOString().slice(0, 10)` — used all over this codebase until
// this fix — reads the UTC calendar day, not the viewer's own. For any
// timezone behind UTC (most of the Americas, for example), the UTC date
// rolls over to tomorrow several hours before local midnight, so every
// "today" computed that way shows the wrong day for a chunk of each
// evening — the calendar, streaks, nutrition-by-day, and habit/weigh-in
// matching all silently pointed at the wrong bucket. This uses the
// Date object's own local getters instead, so the key always matches
// the calendar day the viewer's device says it is.
export function localDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
