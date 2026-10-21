// True only inside the iOS App Store build. Train Solo uses this to keep
// paid purchasing out of the iOS app — Apple requires digital content
// bought inside an iOS app to use In-App Purchase, so programs are bought
// on the website instead and the app only gives access to programs already
// owned. Following Apple's anti-steering rule, the app shows no price, buy
// button or pointer to where else to buy — just that a program isn't
// available in the app.
//
// Two signals, because the installed App Store binary may predate the
// first one:
//  1. The "apexTheme" message handler current builds register
//     (ios/ApexCoach/ViewController.swift) — no browser has it.
//  2. Any build: the app is a plain WKWebView with no custom user agent,
//     so its UA is an iPhone/iPad WebKit one WITHOUT Safari's "Safari/"
//     token. Real Safari, Chrome (CriOS) and Firefox (FxiOS) on iOS all
//     include it; a home-screen web app is excluded via
//     navigator.standalone, and common social-media in-app browsers (also
//     Safari-less WKWebViews) are excluded by their own UA tokens so
//     people arriving from those links can still buy.
const IN_APP_BROWSER_TOKENS = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|TikTok|musical_ly|Snapchat|LinkedInApp|Pinterest|GSA\/|WhatsApp|Messenger/i;

export function isIosAppUserAgent(ua, standalone) {
  if (!ua || !/iPhone|iPad|iPod/.test(ua) || !/AppleWebKit/.test(ua)) return false;
  if (/Safari\//.test(ua) || IN_APP_BROWSER_TOKENS.test(ua)) return false;
  return standalone !== true;
}

export function inIosApp() {
  try {
    if (typeof window === "undefined") return false;
    if (window.webkit?.messageHandlers?.apexTheme) return true;
    return isIosAppUserAgent(window.navigator?.userAgent || "", window.navigator?.standalone);
  } catch {
    return false;
  }
}
