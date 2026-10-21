import { describe, expect, it } from "vitest";
import { isIosAppUserAgent } from "./appShell";

const WKWEBVIEW = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const CHROME_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1";
const INSTAGRAM = `${WKWEBVIEW} Instagram 350.0.0.0 (iPhone15,2; iOS 18_5; en_AU)`;
const DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

describe("isIosAppUserAgent", () => {
  it("recognises the App Store app's plain WKWebView", () => {
    expect(isIosAppUserAgent(WKWEBVIEW, undefined)).toBe(true);
  });
  it("is false for Safari, Chrome and Firefox on iOS", () => {
    expect(isIosAppUserAgent(SAFARI)).toBe(false);
    expect(isIosAppUserAgent(CHROME_IOS)).toBe(false);
  });
  it("is false for a home-screen web app and for social in-app browsers", () => {
    expect(isIosAppUserAgent(WKWEBVIEW, true)).toBe(false);
    expect(isIosAppUserAgent(INSTAGRAM)).toBe(false);
  });
  it("is false off iOS", () => {
    expect(isIosAppUserAgent(DESKTOP)).toBe(false);
    expect(isIosAppUserAgent(ANDROID)).toBe(false);
  });
});
