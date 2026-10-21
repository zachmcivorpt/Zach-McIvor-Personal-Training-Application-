// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";

const DARK = "https://firebasestorage.googleapis.com/v0/b/zach-mcivor-pt-app.firebasestorage.app/o/design%2FappLogoUrlOnDark_1792373913084_7A4D6D51-051F-4656-84C7-217E22048388.png?alt=media&token=x";
const OTHER = "https://firebasestorage.googleapis.com/v0/b/zach-mcivor-pt-app.firebasestorage.app/o/design%2FappLogoUrlOnDark_999_new.png?alt=media&token=y";

async function freshModule() {
  vi.resetModules();
  return import("./appLogo");
}

describe("app logo — instant on launch", () => {
  beforeEach(() => localStorage.clear());

  it("before settings load, uses the logos remembered from last time", async () => {
    let m = await freshModule();
    // never loaded on this device: starts from the bundled current logos
    expect(m.resolveAppLogoUrl(m.appLogoUrls({ appLogoUrl: null }).dark)).toBe("/brand/app-logo-dark-1792373913084.png");
    m.rememberAppLogos(DARK, null);
    m = await freshModule(); // next launch
    expect(m.appLogoUrls({ loginBackgroundUrl: null, appLogoUrl: null })).toEqual({ dark: DARK, light: null, loaded: false });
  });

  it("once settings load, they win — including a removed logo", async () => {
    const m = await freshModule();
    m.rememberAppLogos(DARK, null);
    expect(m.appLogoUrls({ appLogoUrlOnDark: null, appLogoUrlOnLight: null })).toEqual({ dark: null, light: null, loaded: true });
  });

  it("maps the known upload to the small bundled copy, leaves new uploads as-is", async () => {
    const m = await freshModule();
    expect(m.resolveAppLogoUrl(DARK)).toBe("/brand/app-logo-dark-1792373913084.png");
    expect(m.resolveAppLogoUrl(OTHER)).toBe(OTHER);
    expect(m.resolveAppLogoUrl(null)).toBe(null);
  });
});
