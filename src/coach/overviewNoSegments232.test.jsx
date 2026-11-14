// @vitest-environment jsdom
// #232 (owner): the Segments section is gone from the coach Overview.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const users = [{ id: "coach", role: "coach", name: "Zachary McIvor" }, { id: "c1", role: "client", name: "Sam Lee", status: "active" }];
vi.mock("../lib/AppContext", () => ({
  useApp: () => ({
    db: { users, challenges: [], clientPhases: {}, errorLogs: [], exercises: [], formResponses: {}, forms: [], mealPlans: {}, messages: {}, nutritionLogs: {}, scheduledWorkouts: {}, weighIns: {}, workoutLogs: {}, bodyMetrics: {}, clientContext: {}, clientNotes: {}, notifications: [] },
    currentUser: users[0],
    dbReady: true,
    usersReady: true,
    sendMessage: vi.fn(),
    markFormResponseRead: vi.fn(),
    updateUser: vi.fn(),
    broadcastWorkout: vi.fn(),
    phraseApexSuggestion: vi.fn(),
    dismissErrorLog: vi.fn(),
  }),
}));
vi.mock("./CoachClientDetail", () => ({ WorkoutLogCard: () => null }));
vi.mock("./WorkoutEditor", () => ({ default: () => null }));
const { default: CoachDashboard } = await import("./CoachDashboard");
afterEach(() => cleanup());

describe("Coach Overview has no Segments section (#232)", () => {
  it("no Segments heading or segment rows; the rest of Overview still shows", () => {
    render(<CoachDashboard onNavigate={vi.fn()} onOpenClient={vi.fn()} showToast={vi.fn()} />);
    expect(screen.queryByText("Segments")).toBeNull();
    for (const label of ["Need a new training phase", "New exercise personal bests", "Phase ending within a week", "Meal guide ending within a week", "Not messaged in 7+ days"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.getByText("Needs attention")).toBeTruthy();
  });
});
