// #312 (owner): Train Solo and Coaching share ONE Firebase login per email.
// Train Solo's "Delete account" used to delete that login, so a coached
// client (or the coach) who also used Train Solo lost their coaching
// account with it. Train Solo now deletes only its own data; the login is
// removed only when no coaching profile (users/{uid}) uses it.
//
// readCoachingProfile(): resolves true/false; if it throws, the deletion
// stops before anything is removed (never guess "not coached").
export async function soloLoginMayBeDeleted(readCoachingProfile) {
  const coached = await readCoachingProfile();
  return !coached;
}
