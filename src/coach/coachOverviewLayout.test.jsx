// @vitest-environment jsdom
//
// Coach Overview redesign (REGRESSION_TESTS.md #115): the stat tiles became
// a photo header (big active-client count) plus three glass tiles
// (Challenges, Check-ins, Messages), and Coach's notes moved below Recent activity. Every tap
// must still go exactly where the old tiles went, and notes still save
// only after an edit.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const updateUser = vi.fn(async () => {});
const now = Date.now();
const users = [
  { id: "coach", role: "coach", name: "Zachary McIvor", coachNotes: "Weekly body stats" },
  ...["Rusuri Abey", "Jess Taylor", "Liam Moore"].map((n, i) => ({ id: "c" + i, role: "client", status: "active", name: n, createdAt: now - 40 * 86400000 })),
];
vi.mock("../lib/AppContext", () => ({
  useApp: () => ({
    db: { users, challenges: [{ id: "ch1" }, { id: "ch2" }], clientPhases: {}, errorLogs: [], exercises: [], formResponses: {}, forms: [], mealPlans: {}, messages: {}, nutritionLogs: {}, scheduledWorkouts: {}, weighIns: {}, workoutLogs: {}, bodyMetrics: {}, clientContext: {}, clientNotes: {}, notifications: [] },
    currentUser: users[0],
    sendMessage: vi.fn(),
    markFormResponseRead: vi.fn(),
    updateUser,
    broadcastWorkout: vi.fn(),
    phraseApexSuggestion: vi.fn(),
    dismissErrorLog: vi.fn(),
  }),
}));
vi.mock("./CoachClientDetail", () => ({ WorkoutLogCard: () => null }));
vi.mock("./WorkoutEditor", () => ({ default: () => null }));

const { default: CoachDashboard } = await import("./CoachDashboard");

afterEach(() => cleanup());

describe("Coach Overview", () => {
  it("every number goes where its old tile went", () => {
    const onNavigate = vi.fn();
    render(<CoachDashboard onNavigate={onNavigate} onOpenClient={vi.fn()} showToast={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "3 active clients" }));
    fireEvent.click(screen.getByText("Challenges"));
    fireEvent.click(screen.getByText("Messages to reply"));
    fireEvent.click(screen.getByText("Check-ins to review"));
    expect(onNavigate.mock.calls.map((c) => c[0])).toEqual(["clients", "challenges", "messages", "clients"]);
  });

  it("coach's notes save only after an edit", async () => {
    render(<CoachDashboard onNavigate={vi.fn()} onOpenClient={vi.fn()} showToast={vi.fn()} />);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByDisplayValue("Weekly body stats"), { target: { value: "Weekly body stats + photos" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(updateUser).toHaveBeenCalledWith("coach", { coachNotes: "Weekly body stats + photos" });
  });
});
