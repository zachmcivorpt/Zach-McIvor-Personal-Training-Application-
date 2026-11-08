import { doc, setDoc } from "firebase/firestore";
import { soloDb } from "../lib/firebase";
import { getPurchaseTrace } from "../lib/purchases";

// #193: the iPhone app's step-by-step log of the last purchase hand-back
// (PurchaseTrace, #183) is copied to the member's own profile
// (soloUsers/{uid}.purchaseTrace), so a white screen after a purchase can be
// diagnosed without the member opening Profile → Purchase log and sending
// screenshots. Only the member can read or write their own profile
// (firestore.rules). Sent again only when the log has changed; never blocks
// or breaks anything if it fails.
let lastSent = "";

export async function uploadPurchaseTrace(uid, { read = getPurchaseTrace, write } = {}) {
  if (!uid) return false;
  let lines;
  try {
    lines = await read();
  } catch {
    return false; // a build without the log, or the web
  }
  if (!Array.isArray(lines) || lines.length === 0) return false;
  const key = uid + "\n" + lines.join("\n");
  if (key === lastSent) return false;
  const data = { purchaseTrace: { lines: lines.slice(-150), uploadedAt: Date.now() } };
  try {
    if (write) await write(uid, data);
    else await setDoc(doc(soloDb, "soloUsers", uid), data, { merge: true });
    lastSent = key;
    return true;
  } catch {
    return false;
  }
}

export function resetPurchaseTraceUploadForTests() {
  lastSent = "";
}
