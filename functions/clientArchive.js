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

module.exports = { ARCHIVE_DAYS, isArchiveExpired };
