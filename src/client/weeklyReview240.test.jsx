// @vitest-environment jsdom
//
// #240: the coached client's weekly review on their real Progress screen
// (list, page, check-in or skip), opening by itself once after the Sunday
// push, and the same reviews on the coach's client Progress tab (real
// ProgressPanel, db grouped by client, never another client's data).
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.setConfig({ testTimeout: 20000 });
vi.mock("react-router-dom", async (orig) => ({ ...(await orig()), useNavigate: () => vi.fn() }));

const at = (key, h = 9) => new Date(`${key}T${String(h).padStart(2, "0")}:00:00`).getTime();
const log = (clientId, key, sets) => ({ id: `${clientId}_${key}`, clientId, date: at(key), durationMin: 50, entries: sets.map(([exerciseId, weight, reps, isPR]) => ({ exerciseId, sets: [{ weight, reps, isPR: !!isPR }] })) });
const food = (clientId, key, calories, protein) => ({ id: `${clientId}_${key}`, clientId, date: key, calories, protein, meals: { lunch: [{ id: key, name: "Food", calories, protein }] } });
const exercises = [
  { id: "sq", name: "Back Squat" },
  { id: "bp", name: "Bench Press" },
];
const c1Logs = [log("c1", "2026-11-02", [["sq", 100, 5]]), log("c1", "2026-11-09", [["sq", 105, 5, true]]), log("c1", "2026-11-12", [["bp", 80, 5]])];
const c1Food = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"].map((k) => food("c1", k, 2150, 165));

vi.mock("../lib/AppContext", () => ({
  useApp: () => ({
    db: {
      progressPhotos: {},
      workoutLogs: { c1: c1Logs, c2: [log("c2", "2026-11-10", [["bp", 140, 1, true]])] },
      weighIns: { c1: [{ id: "w1", clientId: "c1", date: at("2026-11-04"), weight: 82.4 }, { id: "w2", clientId: "c1", date: at("2026-11-12"), weight: 81.9 }] },
      scheduledWorkouts: { c1: [{ id: "s1", clientId: "c1", date: "2026-11-09" }, { id: "s2", clientId: "c1", date: "2026-11-12" }] },
      nutritionLogs: { c1: c1Food },
      clientPhases: { c1: [] },
      exercises,
      bodyMetrics: { c1: [] },
    },
    logWeight: vi.fn(),
    deleteWeighIn: vi.fn(),
    logBodyMetric: vi.fn(),
    deleteBodyMetric: vi.fn(),
  }),
  getCurrentPhase: () => null,
  programPhases: () => [],
}));

const reviewData = {
  workoutLogs: c1Logs,
  scheduledWorkouts: [{ date: "2026-11-09" }, { date: "2026-11-12" }],
  nutritionLogs: c1Food,
  bodyMetrics: [],
  weighIns: [{ date: at("2026-11-04"), weight: 82.4 }, { date: at("2026-11-12"), weight: 81.9 }],
  targets: { calories: 2150, protein: 160 },
  exercisesById: Object.fromEntries(exercises.map((e) => [e.id, e])),
  phases: [],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 15, 19, 0, 0)); // Sun 15 Nov, 7pm
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderClientProgress(extra = {}) {
  return import("./ClientApp").then(({ ProgressScreen }) =>
    render(
      <ProgressScreen
        userId="c1"
        photos={[]}
        onAddPhoto={() => {}}
        onDeletePhoto={() => {}}
        weighIns={[]}
        onLogWeight={() => {}}
        onDeleteWeighIn={() => {}}
        logsForClient={c1Logs}
        exercisesById={reviewData.exercisesById}
        bodyMetrics={[]}
        onLogBodyMetric={() => {}}
        onDeleteBodyMetric={() => {}}
        scheduledWorkouts={[]}
        reviewData={reviewData}
        {...extra}
      />
    )
  );
}

describe("client Progress: Weekly reviews", () => {
  it("lists the weeks, newest marked New, and opens the review", async () => {
    await renderClientProgress();
    const list = await screen.findByTestId("weekly-reviews");
    expect(within(list).getByText("Every planned session. Done.")).toBeTruthy();
    expect(within(list).getByText("2 of 2 sessions · 1 PR · −0.5 kg")).toBeTruthy();
    expect(within(list).getByText("New")).toBeTruthy();
    fireEvent.click(within(list).getByText("Every planned session. Done."));
    const page = screen.getByTestId("weekly-review-page");
    expect(within(page).getByTestId("review-hero-figure").textContent).toBe("2 of 2");
    expect(within(page).getByTestId("review-nutrition").textContent).toMatch(/Calories on target.*7 of 7 days/);
    expect(within(page).getByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("with a check-in due: Log this week's check-in, or Skip for now", async () => {
    const onOpenCheckIns = vi.fn();
    await renderClientProgress({ checkInDue: true, onOpenCheckIns });
    fireEvent.click(within(await screen.findByTestId("weekly-reviews")).getByText("Every planned session. Done."));
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(screen.queryByTestId("weekly-review-page")).toBe(null);
    fireEvent.click(within(screen.getByTestId("weekly-reviews")).getByText("Every planned session. Done."));
    fireEvent.click(screen.getByRole("button", { name: "Log this week's check-in" }));
    expect(onOpenCheckIns).toHaveBeenCalled();
  });

  it("after the Sunday push the new review opens by itself, once", async () => {
    const { default: WeeklyReviewsSection } = await import("./WeeklyReview");
    const first = render(<WeeklyReviewsSection uid="c1" data={reviewData} dark autoOpen hideList />);
    expect(screen.getByTestId("weekly-review-page")).toBeTruthy();
    expect(screen.queryByTestId("weekly-reviews")).toBe(null);
    first.unmount();
    render(<WeeklyReviewsSection uid="c1" data={reviewData} dark autoOpen hideList />);
    expect(screen.queryByTestId("weekly-review-page")).toBe(null);
  });
});

describe("coach: the client's weekly reviews on their Progress tab", () => {
  it("shows that client's reviews only, read-only", async () => {
    const { ProgressPanel } = await import("../coach/CoachClientDetail");
    render(<ProgressPanel client={{ id: "c1", name: "Alice Smith", nutritionTargets: { calories: 2150, protein: 160 } }} showToast={() => {}} />);
    const list = await screen.findByTestId("weekly-reviews");
    expect(within(list).getByText("Their week in one page, every Sunday.")).toBeTruthy();
    expect(within(list).queryByText("New")).toBe(null);
    fireEvent.click(within(list).getByText("Every planned session. Done."));
    const page = screen.getByTestId("weekly-review-page");
    expect(within(page).getByText("Alice's week")).toBeTruthy();
    expect(within(page).queryByRole("button", { name: /check-in/i })).toBe(null);
    // c2's 140 kg bench PR never appears in Alice's review.
    expect(page.textContent).not.toMatch(/140/);
  });
});
