// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { SOLO_THEMES } from "./SoloThemeContext";
// #304 (owner): Train Solo's logo exactly as the coached client app's top bar:
// on the LEFT, 27px tall, in a 36px row 8px from the top and 10px from the
// left (ClientTopBar: px-2.5 pt-2, 36px buttons), no glow, never centred.
import React from "react";
import { render } from "@testing-library/react";
import { SoloPageHeader } from "./SoloUI";
describe("Train Solo logo like the coached client's (#304)", () => {
  it("left, 27px, the client's padding, no glow", () => {
    for (const mode of ["light", "dark"]) {
      const { getByTestId, unmount } = render(<SoloPageHeader t={SOLO_THEMES[mode]} title="Catalogue" />);
      const logo = getByTestId("solo-header-logo");
      expect(logo.style.height).toBe("27px");
      expect(logo.className).not.toMatch(/mx-auto/);
      expect(logo.style.filter || "").toBe("");
      expect(getByTestId("solo-header-logo-row").className).toMatch(/px-2\.5 pt-2/);
      unmount();
    }
  });
});
