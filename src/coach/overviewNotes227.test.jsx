// @vitest-environment jsdom
// #227 (owner): on the coach Overview, Coach's notes sit above Needs
// attention in a frosted-glass box (not a solid charcoal one), and the
// greeting and count are smaller on phones.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const users = [{ id: "coach", role: "coach", name: "Zachary McIvor", coachNotes: "Call Sam Friday" }];
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

describe("Coach Overview notes and phone heading (#227)", () => {
  it("Coach's notes come before Needs attention", () => {
    render(<CoachDashboard onNavigate={vi.fn()} onOpenClient={vi.fn()} showToast={vi.fn()} />);
    const notes = screen.getByText("Coach's notes");
    const needs = screen.getByText("Needs attention");
    expect(notes.compareDocumentPosition(needs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("the notes box is frosted glass", () => {
    render(<CoachDashboard onNavigate={vi.fn()} onOpenClient={vi.fn()} showToast={vi.fn()} />);
    const box = screen.getByDisplayValue("Call Sam Friday");
    const style = box.getAttribute("style");
    expect(style).toMatch(/rgba\(255, 255, 255, 0\.045\)/);
    expect(style).toMatch(/backdrop-filter: blur/);
    expect(style).not.toMatch(/rgb\(20, 20, 20\)|#141414/i);
  });
  it("the greeting and count are smaller on phones", () => {
    render(<CoachDashboard onNavigate={vi.fn()} onOpenClient={vi.fn()} showToast={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1 }).className).toMatch(/text-\[20px\] sm:text-\[30px\]/);
    expect(screen.getByRole("button", { name: "0 active clients" }).className).toMatch(/text-\[44px\] sm:text-\[56px\]/);
  });
});
