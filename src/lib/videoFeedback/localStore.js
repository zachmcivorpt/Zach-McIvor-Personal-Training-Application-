// Coach video feedback (#219): everything before Publish lives ONLY on the
// coach's device, in IndexedDB. Nothing in this file talks to Firebase.
//
//   projects  one unpublished draft per coach + client (the edit timeline,
//             the written overview, publish progress)
//   blobs     finished recordings and the rendered final video
//   chunks    a recording still in progress, saved every second, so a
//             crash, reload or iOS dropping the page loses at most a second
//
// Every key starts with the coach's uid and the client's id, and a draft is
// only ever loaded for the signed-in coach's own uid, so one account's or
// one client's footage is never shown for another.
//
// Where IndexedDB isn't available (very old browsers, some private modes)
// this falls back to memory and says so (`isPersistent() === false`), so the
// workspace can warn that a reload would lose the recording.

const DB_NAME = "apex-video-feedback";
const DB_VERSION = 1;

export function projectKeyFor(coachUid, clientId) {
  return `${coachUid}::${clientId}`;
}

let dbPromise = null;
let memory = null;

function memoryStore() {
  if (!memory) memory = { projects: new Map(), blobs: new Map(), chunks: new Map() };
  return memory;
}

export function isPersistent() {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

function openDb() {
  if (!isPersistent()) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "key" });
        if (!db.objectStoreNames.contains("blobs")) {
          db.createObjectStore("blobs", { keyPath: "key" }).createIndex("projectKey", "projectKey");
        }
        if (!db.objectStoreNames.contains("chunks")) {
          db.createObjectStore("chunks", { keyPath: "key" }).createIndex("projectKey", "projectKey");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

function reqPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Saving on this device was stopped."));
  });
}

// A full disk is the one save error the coach can do something about.
export function isQuotaError(err) {
  return err?.name === "QuotaExceededError" || /quota/i.test(err?.message || "");
}

async function put(store, value) {
  const db = await openDb();
  if (!db) {
    memoryStore()[store].set(value.key, value);
    return;
  }
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value);
  await txDone(tx);
}

async function get(store, key) {
  const db = await openDb();
  if (!db) return memoryStore()[store].get(key) ?? null;
  const tx = db.transaction(store, "readonly");
  return (await reqPromise(tx.objectStore(store).get(key))) ?? null;
}

async function del(store, key) {
  const db = await openDb();
  if (!db) {
    memoryStore()[store].delete(key);
    return;
  }
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(key);
  await txDone(tx);
}

async function allForProject(store, projectKey) {
  const db = await openDb();
  if (!db) return [...memoryStore()[store].values()].filter((v) => v.projectKey === projectKey);
  const tx = db.transaction(store, "readonly");
  return reqPromise(tx.objectStore(store).index("projectKey").getAll(projectKey));
}

// --- drafts -------------------------------------------------------------
export async function loadProject(coachUid, clientId) {
  if (!coachUid || !clientId) return null;
  const project = await get("projects", projectKeyFor(coachUid, clientId));
  // Belt and braces: never hand back a draft that isn't this coach's.
  if (!project || project.coachUid !== coachUid || project.clientId !== clientId) return null;
  return project;
}

export async function saveProject(project) {
  await put("projects", { ...project, updatedAt: Date.now() });
}

// Throws everything for this draft away: the draft, every recording, any
// half-saved recording and the rendered video.
export async function deleteProject(projectKey) {
  const [blobs, chunks] = await Promise.all([allForProject("blobs", projectKey), allForProject("chunks", projectKey)]);
  await Promise.all([...blobs.map((b) => del("blobs", b.key)), ...chunks.map((c) => del("chunks", c.key)), del("projects", projectKey)]);
}

// --- recordings ---------------------------------------------------------
export async function putBlob(projectKey, id, blob) {
  await put("blobs", { key: `${projectKey}::${id}`, projectKey, id, blob });
}

export async function getBlob(projectKey, id) {
  return (await get("blobs", `${projectKey}::${id}`))?.blob ?? null;
}

export async function deleteBlob(projectKey, id) {
  await del("blobs", `${projectKey}::${id}`);
}

// One piece of a recording in progress (MediaRecorder's timeslice data).
export async function appendChunk(projectKey, sourceId, seq, blob) {
  await put("chunks", { key: `${projectKey}::${sourceId}::${String(seq).padStart(6, "0")}`, projectKey, sourceId, seq, blob });
}

// Joins a recording's saved pieces into one file (in order), stores it as a
// finished recording and clears the pieces.
export async function finalizeChunks(projectKey, sourceId, mime) {
  const chunks = (await allForProject("chunks", projectKey)).filter((c) => c.sourceId === sourceId).sort((a, b) => a.seq - b.seq);
  if (chunks.length === 0) return null;
  const blob = new Blob(
    chunks.map((c) => c.blob),
    { type: mime || chunks[0].blob.type || "video/mp4" }
  );
  await putBlob(projectKey, sourceId, blob);
  await Promise.all(chunks.map((c) => del("chunks", c.key)));
  return blob;
}

// Recordings that were still in progress when the page went away.
export async function unfinishedRecordingIds(projectKey) {
  const chunks = await allForProject("chunks", projectKey);
  return [...new Set(chunks.map((c) => c.sourceId))];
}

// --- device storage -----------------------------------------------------
export async function storageEstimate() {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est || !est.quota) return null;
    return { usage: est.usage || 0, quota: est.quota, free: Math.max(0, est.quota - (est.usage || 0)) };
  } catch {
    return null;
  }
}

// Asks the browser not to clear these files under storage pressure.
export async function requestPersistentStorage() {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) || false;
  } catch {
    return false;
  }
}

// Test hook: forget the in-memory fallback.
export function __resetMemoryStore() {
  memory = null;
}
