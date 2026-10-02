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
import { saveNativeFcmToken } from "./push";

let currentUid = null;
let pendingToken = null;

onAuthStateChanged(getAuth(), (user) => {
  currentUid = user?.uid || null;
  if (currentUid && pendingToken) {
    const token = pendingToken;
    pendingToken = null;
    saveNativeFcmToken(currentUid, token);
  }
});

if (typeof window !== "undefined") {
  window.__apexNativePush = {
    setToken(token) {
      if (!token) return;
      if (currentUid) {
        saveNativeFcmToken(currentUid, token);
      } else {
        // Native can register for push before anyone's signed in yet
        // (it happens on launch) — hold the token until auth catches up.
        pendingToken = token;
      }
    },
  };
}
