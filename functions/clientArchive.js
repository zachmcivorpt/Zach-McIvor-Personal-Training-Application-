// #313 (owner): Remove client archives a coached client instead of deleting
// them. Archived clients are deleted for good by purgeArchivedClients
// (functions/index.js) once ARCHIVE_DAYS have passed; until then the coach
// can restore them from Clients → Archived.
const ARCHIVE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function isArchiveExpired(user, now = Date.now()) {
  const at = Number(user?.archivedAt);
  if (!Number.isFinite(at) || at <= 0) return false;
  if (user.role !== "client") return false;
  return now - at >= ARCHIVE_DAYS * DAY_MS;
}

// #315 (owner): a client must never be deleted without the coach meaning
// it. "Delete now" is allowed only for a client who is ALREADY archived
// (so it's always two separate, deliberate steps) and only when the coach
// typed the client's full name. Returns null when allowed, else the reason.
const norm = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
function deleteNowRefusal(user, confirmName) {
  if (!user) return "not-found";
  if (user.role !== "client") return "not-a-client";
  const at = Number(user.archivedAt);
  if (!Number.isFinite(at) || at <= 0) return "not-archived";
  if (!norm(user.name) || norm(confirmName) !== norm(user.name)) return "name-mismatch";
  return null;
}

module.exports = { ARCHIVE_DAYS, isArchiveExpired, deleteNowRefusal };
