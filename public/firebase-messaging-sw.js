// Handles push notifications that arrive while the app is closed or in the
// background. This is a plain (non-module) service worker file served
// as-is from the site root, so it can't import from src/lib/firebase.js —
// it needs its own copy of the same public, non-secret config, loaded via
// the Firebase "compat" build (the only form usable inside a classic
// service worker without a bundler).
importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAmKtzgfyJ14CjybJzoz2vabfsGxOZw0I4",
  authDomain: "zach-mcivor-pt-app.firebaseapp.com",
  projectId: "zach-mcivor-pt-app",
  storageBucket: "zach-mcivor-pt-app.firebasestorage.app",
  messagingSenderId: "558700619647",
  appId: "1:558700619647:web:3ac804c953f67884659c4a",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "Zach McIvor Personal Training";
  const body = payload.notification?.body || "";
  self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
  });
});
