// Train Solo main goal (#236): saved on the member's own profile
// (soloUsers/{uid}.goal), never waiting on the server.
import { doc, updateDoc, deleteField } from "firebase/firestore";
import { soloDb } from "../lib/firebase";
import { savedOrQueued } from "../lib/offlineWrite";

const seenKey = (uid) => `apexSoloGoalPrompt:${uid}`;

// The Sunday review push counts their week on their own calendar days.
function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export async function saveSoloGoal(uid, goal) {
  const tz = deviceTimeZone();
  await savedOrQueued(updateDoc(doc(soloDb, "soloUsers", uid), { goal: goal || deleteField(), goalPromptSeenAt: Date.now(), ...(tz ? { tz } : {}) }));
}

// The first-time goal screen shows once ever: marked on the account and
// this phone the moment it shows.
export function goalPromptSeen(profile) {
  if (!profile?.id) return true;
  if (profile.goal || profile.goalPromptSeenAt) return true;
  try {
    return !!localStorage.getItem(seenKey(profile.id));
  } catch {
    return false;
  }
}

export function markGoalPromptSeen(uid) {
  try {
    localStorage.setItem(seenKey(uid), String(Date.now()));
  } catch {
    /* the account flag still records it */
  }
  savedOrQueued(updateDoc(doc(soloDb, "soloUsers", uid), { goalPromptSeenAt: Date.now() })).catch(() => {});
}
