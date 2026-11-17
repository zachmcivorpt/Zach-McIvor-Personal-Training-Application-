// @vitest-environment jsdom
// #266 (owner): on a phone the coach's client Nutrition tab didn't match the
// Training tab — its first box ran edge to edge, square (it was pulled out of
// the page gutter), and the other boxes were square solid cards. Now it opens
// with the same header as Training ("NAME · NUTRITION", the target, two
// actions) and every box is the same rounded glass panel inside the gutter.
// Renders the REAL CoachClientDetail with db grouped by client (#167).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CoachGlass } from "./darkUI";

let ctx;
vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ctx }));
vi.mock("./MealPlanBuilder", () => ({ default: () => <div data-testid="meal-plan-builder" /> }));
import CoachClientDetail from "./CoachClientDetail";

afterEach(() => cleanup());

function renderTab() {
  const now = Date.now();
  const client = { id: "u1", name: "Geoff Bennett", status: "active", role: "client", createdAt: now, nutritionTargets: { calories: 2300, proteinPct: 29, carbsPct: 44, fatPct: 27 } };
  ctx = {
    db: {
      users: [client],
      exercises: [],
      workoutLogs: { u1: [] },
      clientPhases: {}, scheduledWorkouts: { u1: [] }, weighIns: {}, nutritionLogs: { u1: [] }, habits: { u1: [] }, habitLog: {}, liveSessions: {},
      workoutComments: {}, clientNotes: {}, messages: {}, forms: [], formSchedules: { u1: [] }, formResponses: {}, bodyStatsSchedules: {}, videoFeedback: {}, programs: [], appDesign: {},
      mealPlans: {}, masterMeals: [],
    },
    currentUser: { id: "coach-1", role: "coach" },
    updateUser: vi.fn(),
    setNutritionForDate: vi.fn(() => Promise.resolve()),
  };
  return render(
    <MemoryRouter>
      <CoachGlass>
        <CoachClientDetail clientId="u1" onClose={() => {}} showToast={() => {}} initialTab="nutrition" />
      </CoachGlass>
    </MemoryRouter>
  );
}

describe("client Nutrition tab matches Training (#266)", () => {
  it("opens with the Training-style header and working actions", () => {
    renderTab();
    const header = screen.getByTestId("nutrition-command-header");
    expect(header.textContent).toMatch(/Geoff · Nutrition/);
    expect(header.textContent).toMatch(/2,300 kcal a day · 167g protein/);
    fireEvent.click(within(header).getByText(/MEAL GUIDE/));
    expect(screen.getByTestId("meal-plan-builder")).toBeTruthy();
  });

  it("today's log is a rounded glass panel inside the gutter, never full-bleed or square", () => {
    renderTab();
    const title = screen.getByText("Today's Nutrition Log");
    const panel = title.closest("[data-glass]");
    expect(panel).toBeTruthy();
    expect(panel.className).toMatch(/rounded-2xl/);
    expect(panel.className).not.toMatch(/-mx-4/);
    // the goal and graph cards are glass panels too
    expect(screen.getByText(/Calories per day/).closest("[data-glass]")).toBeTruthy();
    expect(screen.getByText("Nutrition Graph").closest("[data-glass]")).toBeTruthy();
  });
});
