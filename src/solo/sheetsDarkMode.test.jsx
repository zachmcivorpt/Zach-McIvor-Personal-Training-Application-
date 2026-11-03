// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

afterEach(cleanup);

// #146: in dark mode the sheets' titles and headings were black on charcoal
// — the sheet opens outside the page, so text without its own colour fell
// back to black.
describe("Train Solo sheets in dark mode", () => {
  const textColourOf = (el) => {
    for (let n = el; n; n = n.parentElement) if (n.style?.color) return n.style.color;
    return "";
  };
  it("every heading and title is the theme's light text", async () => {
    const { SOLO_THEMES } = await import("./SoloThemeContext");
    const { SwitchProgramSheet, ProgramsGuideSheet, PlanSessionSheet } = await import("./SoloProgramSwitch");
    const t = SOLO_THEMES.dark;
    const white = "rgb(255, 255, 255)";
    render(
      <>
        <ProgramsGuideSheet open onClose={() => {}} dark t={t} />
        <SwitchProgramSheet open onClose={() => {}} programName="Strength Foundation: Building your Strength Base" resumeWeek={3} current={{ name: "Time to Get Jacked" }} onConfirm={() => {}} dark t={t} />
        <PlanSessionSheet open onClose={() => {}} session={{ name: "Upper Body Day 1" }} days={[{ key: "2026-11-03", weekday: "Today", date: 3, full: "Tuesday" }]} suggested="2026-11-03" onConfirm={() => {}} dark t={t} />
      </>
    );
    for (const text of ["One program at a time", "Switch whenever you like", "Pick up where you left off", "Strength Foundation: Building your Strength Base", "Upper Body Day 1"]) {
      expect(textColourOf(screen.getByText(text))).toBe(white);
    }
  });
});
