// One-off (owner, 2026-11-20): copy a client removed by mistake back from a
// restored Firestore backup (SRC database) into the live (default) database,
// then re-create their login with the SAME uid so everything links up.
// Never overwrites a record that already exists. WRITE=1 to actually copy.
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const app = initializeApp({ projectId: "zach-mcivor-pt-app" });
const src = getFirestore(app, process.env.SRC);
const dst = getFirestore(app);
const WRITE = process.env.WRITE === "1";
const mask = (e) => String(e || "").replace(/^(.).*(@.*)$/, "$1***$2");

const hits = (await src.collection("users").get()).docs.filter((d) => (d.data().name || "").toLowerCase().includes(process.env.NAME.toLowerCase()));
if (hits.length !== 1) {
  console.log("Matches:", hits.map((d) => [d.id, d.data().name, d.data().role]));
  process.exit(1);
}
const u = hits[0], uid = u.id, email = u.data().email;
console.log("Client:", u.data().name, mask(email), uid, "role:", u.data().role);
const cols = ["workoutLogs","messages","workoutComments","progressPhotos","savedMeals","habits","clientPhases","formSchedules","formResponses","weighIns","scheduledWorkouts","bodyStatsSchedules","nutritionLogs","bodyMetrics","notifications","clientNotes","videoFeedback"];
const refs = [u.ref];
const perCol = {};
for (const c of cols) {
  const docs = (await src.collection(c).where("clientId", "==", uid).get()).docs;
  if (docs.length) perCol[c] = docs.length;
  refs.push(...docs.map((d) => d.ref));
}
for (const c of ["habitLog", "mealPlans"]) {
  const d = await src.collection(c).doc(uid).get();
  if (d.exists) { refs.push(d.ref); perCol[c] = 1; }
}
console.log("In backup:", JSON.stringify(perCol));
let copied = 0, skipped = 0;
for (const ref of refs) {
  const target = dst.doc(ref.path);
  if ((await target.get()).exists) { skipped++; continue; }
  if (WRITE) await target.set((await ref.get()).data());
  copied++;
}
console.log(`${WRITE ? "Copied" : "Would copy"} ${copied} records (${skipped} already in the live database).`);
let login = "unknown";
try { await getAuth().getUser(uid); login = "exists"; } catch { login = "missing"; }
if (WRITE && login === "missing") { await getAuth().createUser({ uid, email }); login = "re-created (same uid)"; }
console.log("Login:", login);
process.exit(0);
