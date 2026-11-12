// @vitest-environment jsdom
// #225 (owner): the coach Overview header has no gym photo and no box — just
// the greeting and roster count on the page with a see-through APEX mark in
// the background. Every number still goes where it went.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const users = [
  { id: "coach", role: "coach", name: "Zachary McIvor" },
  { id: "c1", role: "client", status: "active", name: "Sam Carter", createdAt: Date.now() - 40 * 86400000 },
];
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

describe("Coach Overview header (#225)", () => {
  it("has no photo and no box, and shows the see-through APEX mark", () => {
    const onNavigate = vi.fn();
    const { container } = render(<CoachDashboard onNavigate={onNavigate} onOpenClient={vi.fn()} showToast={vi.fn()} />);
    const hero = screen.getByTestId("overview-hero");
    expect(container.querySelector('img[src*="gym-dark"]')).toBeNull();
    expect(hero.getAttribute("style") || "").not.toMatch(/background|border/);
    expect(hero.className).not.toMatch(/rounded|border|bg-/);
    expect(screen.getByTestId("overview-mark").querySelectorAll("[data-testid=glass-mark-svg]").length).toBeGreaterThan(0);
    expect(screen.getByText(/Good (morning|afternoon|evening), Zachary/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "1 active clients" }));
    expect(onNavigate).toHaveBeenCalledWith("clients");
  });
});
