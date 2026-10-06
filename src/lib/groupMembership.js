// Shared by AppContext.jsx's updateGroup — the member ids that are
// present in the CURRENT roster but missing from the NEXT one, i.e. who
// is being removed by this particular update. Used to know whose uid
// must be stripped from the group's past groupMessages docs so removal
// actually revokes access to history, not just future messages.
export function removedMemberIds(currentIds, nextIds) {
  const next = new Set(nextIds || []);
  return (currentIds || []).filter((uid) => !next.has(uid));
}
