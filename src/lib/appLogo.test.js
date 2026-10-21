import { describe, expect, it } from "vitest";
import { resolveAppLogoUrl } from "./appLogo";

const DARK = "https://firebasestorage.googleapis.com/v0/b/zach-mcivor-pt-app.firebasestorage.app/o/design%2FappLogoUrlOnDark_1792373913084_7A4D6D51-051F-4656-84C7-217E22048388.png?alt=media&token=x";
const OTHER = "https://firebasestorage.googleapis.com/v0/b/zach-mcivor-pt-app.firebasestorage.app/o/design%2FappLogoUrlOnDark_999_new.png?alt=media&token=y";

describe("resolveAppLogoUrl", () => {
  it("shows the current dark upload as the mountain, leaves new uploads as-is", () => {
    expect(resolveAppLogoUrl(DARK)).toBe("/brand/app-logo-dark-mountain.png");
    expect(resolveAppLogoUrl(OTHER)).toBe(OTHER);
    expect(resolveAppLogoUrl(null)).toBe(null);
  });
});
