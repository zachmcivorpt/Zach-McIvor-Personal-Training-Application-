// #315 (owner): a client must never be archived or deleted without the
// coach deliberately typing it. A client was removed from the coach's iPhone
// at 16:11:56 on 2026-11-20 with three taps and no typing (⋮ → Remove client
// → Confirm). Every Remove / Delete now goes through these checks, in the UI
// AND in AppContext, so no button, menu or future screen can skip them.

const norm = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();

// The coach typed this client's full name (case and extra spaces ignored).
// An empty or missing name never matches.
export function nameConfirmed(typed, name) {
  const want = norm(name);
  return !!want && norm(typed) === want;
}

// Bulk remove (several clients at once) is confirmed by typing REMOVE.
export const BULK_REMOVE_WORD = "REMOVE";
export function bulkConfirmed(typed) {
  return String(typed || "").trim().toUpperCase() === BULK_REMOVE_WORD;
}

// Kept on the archived client so "who / where / when" is never a guess again.
export function deviceLabel(ua = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  if (/iPad/.test(ua)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Unknown device";
}
