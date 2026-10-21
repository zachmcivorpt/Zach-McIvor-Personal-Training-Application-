// Bridge for the iOS App Store build only. That build is a bare WKWebView
// (ios/ApexCoach/ViewController.swift) with no Push API support, so its
// AppDelegate gets an APNs/FCM token natively and hands it to this app the
// only way it can: calling a global function on `window` after evaluating
// JS in the webview. This file just needs to exist and be imported once
// (see main.jsx) so that function is there by the time native calls it.
//
// On every other build (regular browser, Android TWA) this module does
// nothing — nobody ever calls window.__apexNativePush.setToken.
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { saveNativeFcmToken, saveSoloNativeFcmToken } from "./push";
import { soloAuth } from "./firebase";

let currentUid = null;
let pendingToken = null;
// Train Solo signs in on its own auth instance (soloAuth), so its customer
// never shows up in the listener below. The device's latest token is kept
// and saved onto the Solo account too whenever one is signed in.
let currentSoloUid = null;
let latestToken = null;

// Mirrors enablePush()'s own localStorage write (src/lib/push.js), keyed
// per-uid the same way — so the Push Notifications toggle in Settings
// reflects reality on the native build too, for whichever account is
// actually signed in. Without this, that screen read a bare "pushToken"
// key as never-set and showed "Turn on" even though push was already
// registered and working, and tapping it then threw "not supported"
// (WKWebView has no Web Push API, so enablePush() always fails here). A
// non-namespaced key would also leak one client's enabled state onto the
// next client signed in on the same device — see NotificationsPromptCard.
function registerToken(uid, token) {
  localStorage.setItem(`pushToken_${uid}`, token);
  saveNativeFcmToken(uid, token);
}

onAuthStateChanged(getAuth(), (user) => {
  currentUid = user?.uid || null;
  if (currentUid && pendingToken) {
    const token = pendingToken;
    pendingToken = null;
    registerToken(currentUid, token);
  }
});

onAuthStateChanged(soloAuth, (user) => {
  currentSoloUid = user?.uid || null;
  if (currentSoloUid && latestToken) saveSoloNativeFcmToken(currentSoloUid, latestToken);
});

if (typeof window !== "undefined") {
  window.__apexNativePush = {
    setToken(token) {
      if (!token) return;
      latestToken = token;
      if (currentSoloUid) saveSoloNativeFcmToken(currentSoloUid, token);
      if (currentUid) {
        registerToken(currentUid, token);
      } else {
        // Native can register for push before anyone's signed in yet
        // (it happens on launch) — hold the token until auth catches up.
        pendingToken = token;
      }
    },
  };
}
