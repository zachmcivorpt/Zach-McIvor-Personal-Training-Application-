// True only inside the iOS App Store build: its WKWebView registers the
// "apexTheme" message handler (ios/ApexCoach/ViewController.swift), which
// no browser has. Train Solo uses this to keep paid purchasing out of the
// iOS app — Apple requires digital content bought inside an iOS app to use
// In-App Purchase, so programs are bought on the website instead and the
// app only gives access to programs already owned. Following Apple's
// anti-steering rule, the app shows no price, buy button or pointer to
// where else to buy — just that a program isn't available in the app.
export function inIosApp() {
  try {
    return typeof window !== "undefined" && !!window.webkit?.messageHandlers?.apexTheme;
  } catch {
    return false;
  }
}
