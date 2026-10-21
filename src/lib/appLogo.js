// Which logo the app shows, decided so it never flashes a wrong one.
//
// The coach-uploaded logos live on settings/appDesign. That doc's first
// snapshot usually comes from this device's own Firestore cache, which can
// be a logo the coach has since replaced, so showing it would flash the old
// logo before the new one. Instead every Logo waits (invisible, space kept)
// until the server confirms the current logos, has the image fully loaded,
// and only then fades it in. The confirmation is one small direct request
// for just the logo fields (much quicker than waiting for the live listener
// to connect); the listener then keeps the logos live. Only when the device
// is offline does it fall back to the logos remembered from the last
// confirmed load — never on a timer while online, which could show an
// out-of-date logo.
//
// Known uploads map to small copies bundled with the app (cached and
// available offline), so once confirmed they appear immediately.
import { doc, onSnapshot } from "firebase/firestore";
import { db as firestore, firebaseApp } from "./firebase";

const BUNDLED = {
  "design/appLogoUrlOnDark_1792373913084_7A4D6D51-051F-4656-84C7-217E22048388.png": "/brand/app-logo-dark-1792373913084.png",
  "design/appLogoUrlOnLight_1792373876950_IMG_2121.png": "/brand/app-logo-light-1792373876950.png",
};

const MEMORY_KEY = "apexAppLogos";

function readMemory() {
  try {
    const v = JSON.parse(localStorage.getItem(MEMORY_KEY) || "null");
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

function pick(design) {
  return {
    appLogoUrlOnDark: design?.appLogoUrlOnDark || null,
    appLogoUrlOnLight: design?.appLogoUrlOnLight || null,
    loginLogoUrl: design?.loginLogoUrl || null,
  };
}

let state = { ready: false, logos: null };
const subscribers = new Set();
let started = false;

function set(next) {
  state = next;
  subscribers.forEach((fn) => fn());
}

function confirm(logos) {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(logos));
  } catch {}
  set({ ready: true, logos });
}

function fallBackIfOffline() {
  if (!state.ready && typeof navigator !== "undefined" && navigator.onLine === false) {
    set({ ready: true, logos: readMemory() || pick({}) });
  }
}

// settings/appDesign is public-read (firestore.rules), so a plain REST GET
// works before anyone signs in. Field values come back typed
// ({ stringValue } / { nullValue }).
async function fetchLogosFromServer() {
  const { projectId, apiKey } = firebaseApp.options;
  const fields = ["appLogoUrlOnDark", "appLogoUrlOnLight", "loginLogoUrl"].map((f) => `mask.fieldPaths=${f}`).join("&");
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/appDesign?key=${apiKey}&${fields}`);
  if (res.status === 404) return pick({});
  if (!res.ok) throw new Error(`appDesign ${res.status}`);
  const body = await res.json();
  const f = body.fields || {};
  return pick({
    appLogoUrlOnDark: f.appLogoUrlOnDark?.stringValue,
    appLogoUrlOnLight: f.appLogoUrlOnLight?.stringValue,
    loginLogoUrl: f.loginLogoUrl?.stringValue,
  });
}

function start() {
  if (started) return;
  started = true;
  try {
    onSnapshot(
      doc(firestore, "settings", "appDesign"),
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.fromCache) return; // possibly stale — wait for the server
        confirm(pick(snap.exists() ? snap.data() : {}));
      },
      () => {}
    );
  } catch {}
  fetchLogosFromServer()
    .then((logos) => {
      if (!state.ready) confirm(logos);
    })
    .catch(fallBackIfOffline);
  fallBackIfOffline();
  if (typeof window !== "undefined") window.addEventListener("offline", fallBackIfOffline);
}

export function subscribeAppLogos(fn) {
  start();
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function getAppLogos() {
  return state;
}

function storagePath(url) {
  try {
    const match = /\/o\/([^?]+)/.exec(new URL(url).pathname);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export function resolveAppLogoUrl(url) {
  if (!url) return null;
  return BUNDLED[storagePath(url)] || url;
}

// Test-only: reset the module's state between tests.
export function __resetAppLogosForTest() {
  state = { ready: false, logos: null };
  started = false;
  subscribers.clear();
}
