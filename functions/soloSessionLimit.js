// Train Solo Free: up to 3 saved sessions (src/solo/soloAccess.js
// FREE_SAVED_SESSIONS), enforced on the server too (#159). The app already
// stops a 4th; this stops one written straight to Firestore (rules can't
// count documents). Runs when a soloCustomSessions doc is created.
//
// Never removes a session a Free member was allowed to keep: their 3 OLDEST
// sessions always stay (by createdAt, then id), so several sessions arriving
// together — e.g. saved offline, synced at once — can't knock out each other.
// A new session past that is removed only when subscriptions are live and
// the account has no paid-up Plus or All Access (server-written plusUntil).
// A lapsed member keeps every session they made; they just can't add more,
// exactly as the app says.

const FREE_SAVED_SESSIONS = 3;

function gatesLive(monetisation, uid) {
  if (monetisation?.live === true) return true;
  return !!uid && Array.isArray(monetisation?.testUids) && monetisation.testUids.includes(uid);
}

// Pure: should the newly created session `newId` be removed?
function sessionOverFreeLimit({ monetisation, entitlement, uid, sessions, newId, now = Date.now() }) {
  if (!gatesLive(monetisation, uid)) return false;
  if (Number(entitlement?.plusUntil || 0) > now) return false;
  const keep = [...(sessions || [])]
    .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0) || String(a.id).localeCompare(String(b.id)))
    .slice(0, FREE_SAVED_SESSIONS)
    .map((s) => s.id);
  return !keep.includes(newId);
}

// Firestore glue: `snap` is the created doc's snapshot.
async function enforceFreeSessionLimit(db, snap, now = Date.now()) {
  const data = snap.data() || {};
  const uid = data.soloUserId;
  if (!uid) return false;
  const [mon, ent, list] = await Promise.all([
    db.collection("settings").doc("soloMonetisation").get(),
    db.collection("soloEntitlements").doc(uid).get(),
    db.collection("soloCustomSessions").where("soloUserId", "==", uid).get(),
  ]);
  const remove = sessionOverFreeLimit({
    monetisation: mon.exists ? mon.data() : {},
    entitlement: ent.exists ? ent.data() : {},
    uid,
    sessions: list.docs.map((d) => ({ id: d.id, createdAt: d.data().createdAt })),
    newId: snap.id,
    now,
  });
  if (remove) {
    console.warn("Removed a saved session past the Free limit", uid, snap.id);
    await snap.ref.delete();
  }
  return remove;
}

module.exports = { FREE_SAVED_SESSIONS, sessionOverFreeLimit, enforceFreeSessionLimit };
