// @vitest-environment jsdom
// #224 (owner): the coach's client Calendar tab no longer shows "Recent
// Training Load", for any client; the month's adherence and the calendar
// stay. Renders the REAL CoachClientDetail with db grouped by client (#167).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let ctx;
vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ctx }));
import CoachClientDetail from "./CoachClientDetail";

afterEach(() => cleanup());

describe("Calendar tab without Recent Training Load (#224)", () => {
  it("shows adherence and the calendar but no training load card", () => {
    const now = Date.now();
    const client = { id: "u1", name: "John Hopkins", status: "active", role: "client", createdAt: now };
    ctx = {
      db: {
        users: [client],
        exercises: [{ id: "bp", name: "Bench Press", category: "Chest", primaryMuscles: ["Chest"] }],
        workoutLogs: { u1: [{ id: "l1", clientId: "u1", date: now - 86400000, dayLabel: "Upper", entries: [{ exerciseId: "bp", sets: [{ weight: 80, reps: 5 }] }] }] },
        clientPhases: {}, scheduledWorkouts: { u1: [] }, weighIns: {}, nutritionLogs: { u1: [] }, habits: { u1: [] }, habitLog: {}, liveSessions: {},
        workoutComments: {}, clientNotes: {}, messages: {}, forms: [], formSchedules: { u1: [] }, formResponses: {}, bodyStatsSchedules: {}, videoFeedback: {}, programs: [], appDesign: {},
      },
      currentUser: { id: "coach-1", role: "coach" },
    };
    render(
      <MemoryRouter>
        <CoachClientDetail clientId="u1" onClose={() => {}} showToast={() => {}} initialTab="calendar" />
      </MemoryRouter>
    );
    expect(screen.queryByText("Recent Training Load")).toBeNull();
    expect(screen.queryByText(/Sets logged, last 14 days/)).toBeNull();
    expect(screen.getByText("Monthly Training Adherence")).toBeTruthy();
  });
});
