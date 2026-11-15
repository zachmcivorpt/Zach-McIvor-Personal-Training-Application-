// Train Solo training partners (#234): Firestore reads and writes for the
// Team week. The activity docs are written only by the server
// (functions/soloPartners.js); the app makes invite codes, joins and ends
// pairs, and reads.
import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocFromServer, onSnapshot, query, setDoc, updateDoc, deleteDoc, where } from "firebase/firestore";
import { soloDb } from "../lib/firebase";
import { savedOrQueued } from "../lib/offlineWrite";
import { MAX_PARTNERS, makePartnerCode, pairIdFor } from "./partners";

const EMPTY = [];

function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

// The server counts sessions on the member's own calendar days.
async function rememberTimeZone(profile) {
  const tz = deviceTimeZone();
  if (!tz || !profile?.id || profile.tz === tz) return;
  await savedOrQueued(updateDoc(doc(soloDb, "soloUsers", profile.id), { tz })).catch(() => {});
}

// The member's invite code: the one on their profile, else a new one.
export async function ensurePartnerCode(profile) {
  if (!profile?.id) throw new Error("Not signed in.");
  await rememberTimeZone(profile);
  if (profile.partnerCode) return profile.partnerCode;
  const code = makePartnerCode();
  const firstName = String(profile.name || "").trim().split(/\s+/)[0] || "";
  await savedOrQueued(setDoc(doc(soloDb, "soloPartnerCodes", code), { uid: profile.id, firstName, createdAt: Date.now() }));
  await savedOrQueued(updateDoc(doc(soloDb, "soloUsers", profile.id), { partnerCode: code }));
  return code;
}

// Who a code belongs to (the join page shows their first name).
export async function lookUpPartnerCode(code) {
  const snap = await getDoc(doc(soloDb, "soloPartnerCodes", code));
  return snap.exists() ? { code, ...snap.data() } : null;
}

// Join the code's owner. Throws a message to show when it can't.
export async function joinPartner(profile, code, { pairs = EMPTY } = {}) {
  if (!profile?.id) throw new Error("Sign in first.");
  let owner;
  try {
    const snap = await getDocFromServer(doc(soloDb, "soloPartnerCodes", code));
    owner = snap.exists() ? snap.data() : null;
  } catch {
    throw new Error("Couldn't check that code — check your connection and try again.");
  }
  if (!owner?.uid) throw new Error("That code doesn't match anyone. Check it and try again.");
  if (owner.uid === profile.id) throw new Error("That's your own code — send it to a friend.");
  const id = pairIdFor(profile.id, owner.uid);
  if (pairs.some((p) => p.id === id)) return { id, already: true, firstName: owner.firstName };
  if (pairs.length >= MAX_PARTNERS) throw new Error(`You can train with up to ${MAX_PARTNERS} partners.`);
  await rememberTimeZone(profile);
  const members = [profile.id, owner.uid].sort();
  try {
    await setDoc(doc(soloDb, "soloPartners", id), { members, joinedBy: profile.id, code, createdAt: Date.now() });
  } catch {
    throw new Error("Couldn't join — check your connection and try again.");
  }
  return { id, already: false, firstName: owner.firstName };
}

export async function endPartnership(pairId) {
  await savedOrQueued(deleteDoc(doc(soloDb, "soloPartners", pairId)));
}

export async function setPartnerAlerts(uid, enabled) {
  await savedOrQueued(updateDoc(doc(soloDb, "soloUsers", uid), { "notificationPrefs.partners": !!enabled }));
}

// The member's pairs and everyone's activity docs (their own included),
// live. `ready` is false until the pairs have loaded, so nothing says
// "no partners" before it knows.
export function usePartners(uid) {
  const [pairs, setPairs] = useState(EMPTY);
  const [ready, setReady] = useState(false);
  const [activity, setActivity] = useState({});

  useEffect(() => {
    setPairs(EMPTY);
    setReady(false);
    if (!uid) return undefined;
    return onSnapshot(
      query(collection(soloDb, "soloPartners"), where("members", "array-contains", uid)),
      (snap) => {
        setPairs(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
        setReady(true);
      },
      () => setReady(true)
    );
  }, [uid]);

  const memberKey = [uid, ...pairs.map((p) => p.members.find((m) => m !== uid))].filter(Boolean).join(",");
  useEffect(() => {
    if (!memberKey) return undefined;
    const unsubs = memberKey.split(",").map((m) =>
      onSnapshot(
        doc(soloDb, "soloPartnerActivity", m),
        (snap) => setActivity((prev) => ({ ...prev, [m]: snap.exists() ? snap.data() : null })),
        () => {}
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [memberKey]);

  return { pairs, ready, activity };
}
