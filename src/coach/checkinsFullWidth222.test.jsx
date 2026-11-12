// @vitest-environment jsdom
// #222: the coach's client Check-ins tab (Video Feedback, Scheduled
// Check-ins, Responses) runs the page's full width, not a 672px column.
// Renders the REAL CoachClientDetail with db grouped by client (#167).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let ctx;
vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ctx }));
import CoachClientDetail from "./CoachClientDetail";

afterEach(() => cleanup());

describe("Check-ins tab is page width (#222)", () => {
  it("has no narrow max-width column", () => {
    const client = { id: "u1", name: "Zach McIvor", status: "active", role: "client", createdAt: Date.now() };
    ctx = {
      db: { users: [client], exercises: [], workoutLogs: {}, clientPhases: {}, scheduledWorkouts: {}, weighIns: {}, nutritionLogs: {}, habits: {}, habitLog: {}, liveSessions: {}, workoutComments: {}, clientNotes: {}, messages: {}, forms: [], formSchedules: { u1: [] }, formResponses: { u1: [] }, videoFeedback: { u1: [] }, programs: [], appDesign: {} },
      currentUser: { id: "coach-1", role: "coach" },
      markFormResponseRead: vi.fn(),
      unscheduleForm: vi.fn(),
      toggleFormSchedule: vi.fn(),
    };
    render(
      <MemoryRouter>
        <CoachClientDetail clientId="u1" onClose={() => {}} showToast={() => {}} initialTab="checkins" />
      </MemoryRouter>
    );
    const tab = screen.getByTestId("checkins-tab");
    expect(tab.className).not.toMatch(/max-w-/);
    expect(tab.className).toContain("w-full");
    expect(screen.getByText("Video Feedback")).toBeTruthy();
    expect(screen.getByText("Scheduled Check-ins")).toBeTruthy();
  });
});
