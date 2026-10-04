// Replaces functions/index.js's onClientActivated Firestore trigger.
//
// Before a client accepts their invite, there's no real Firebase Auth
// account for them yet — so the coach can still build out their whole
// program, schedule, notes, etc. against a synthetic id (their invite's
// email-derived username; see activateAccount()'s comment in
// AppContext.jsx). The moment they set a password and Firebase Auth mints
// their real, randomly-generated uid, every one of those documents is
// left keyed to that OLD id — invisible from their real account forever
// unless it gets re-keyed to the new uid. A client's own Firestore rules
// can't safely do this re-keying themselves (most of these collections
// aren't even client-writable at all, by design), so it happens here,
// server-side with the Admin SDK, called once by activateAccount() the
// moment it's created the new users/{uid} doc.
import { getDb, requireUid } from "../api-lib/firebaseAdmin.js";
import { CLIENT_ID_COLLECTIONS } from "../api-lib/notify.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let callerUid;
  try {
    callerUid = await requireUid(req);
  } catch (err) {
    res.status(err.statusCode || 401).json({ error: err.message });
    return;
  }

  const { uid, oldId } = req.body || {};
  // Only the client this re-key is actually FOR can trigger it — the
  // verified token's uid must match. This is the one moment a freshly
  // created client is signed in as themselves and knows their own old
  // (pre-activation, email-derived) id, so there's no legitimate reason
  // for anyone else to ever call this for a different uid.
  if (!uid || uid !== callerUid) {
    res.status(403).json({ error: "Can only migrate your own account." });
    return;
  }
  if (!oldId || oldId === uid) {
    res.status(200).json({ migrated: false });
    return;
  }

  try {
    const db = getDb();
    for (const name of CLIENT_ID_COLLECTIONS) {
      const snap = await db.collection(name).where("clientId", "==", oldId).get();
      if (snap.empty) continue;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.update(d.ref, { clientId: uid }));
      await batch.commit();
    }

    // habitLog/{clientId}: the doc id itself IS the clientId, not a field
    // on it, so this one's a read-write-delete rather than a field update.
    const oldHabitLogRef = db.collection("habitLog").doc(oldId);
    const oldHabitLogSnap = await oldHabitLogRef.get();
    if (oldHabitLogSnap.exists) {
      await db.collection("habitLog").doc(uid).set(oldHabitLogSnap.data(), { merge: true });
      await oldHabitLogRef.delete();
    }

    res.status(200).json({ migrated: true });
  } catch (err) {
    console.error("client-activated migration failed:", err);
    res.status(500).json({ error: "Migration failed" });
  }
}
