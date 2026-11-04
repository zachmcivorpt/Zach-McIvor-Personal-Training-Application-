// @vitest-environment jsdom
// #155: Train Solo's light mode is pure white, flowing into the white
// status-bar strip at the top (it was off-white #F5F4F1).
import React from "react";
import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/SoloAppContext", () => ({ useSoloApp: () => ({ soloCurrentUser: null, soloAuthUser: null, soloBranding: {} }) }));
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SOLO_THEMES, SoloThemeProvider } from "./SoloThemeContext";

describe("Train Solo light mode is white", () => {
  it("page, pop-ups and the phone's top strip are white; chips still show on white", () => {
    expect(SOLO_THEMES.light.bg).toBe("#FFFFFF");
    expect(SOLO_THEMES.light.sheetGlassBg).toBe("rgba(255,255,255,0.92)");
    expect(SOLO_THEMES.light.chipBg).not.toMatch(/^rgba\(255,255,255/);
    localStorage.setItem("soloThemeDark", "false");
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
    render(<MemoryRouter initialEntries={["/solo/home"]}><SoloThemeProvider><p>x</p></SoloThemeProvider></MemoryRouter>);
    expect(meta.getAttribute("content")).toBe("#FFFFFF");
  });

  it("dark mode is unchanged", () => {
    expect(SOLO_THEMES.dark.bg).toBe("#0A0A0B");
  });
});
