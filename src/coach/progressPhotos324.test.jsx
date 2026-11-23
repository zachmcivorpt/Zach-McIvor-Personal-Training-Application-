// @vitest-environment jsdom
// #324 (owner, 2026-11-24): on the coach's client Progress tab a progress
// photo opens full screen, can be tagged Front / Side / Back, and two dates
// can be compared side by side. Helpers checked by hand, then the REAL
// CoachClientDetail with db grouped by client (#167).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { sortPhotos, filterByPose, defaultComparison, comparisonFigures } from "../lib/progressPhotos";

let ctx;
vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ctx }));
import CoachClientDetail from "./CoachClientDetail";

const D = (m, d) => new Date(2026, m - 1, d, 9).getTime();
const photos = [
  { id: "p3", clientId: "u1", url: "https://x/3.jpg", date: D(11, 24), pose: "front" },
  { id: "p1", clientId: "u1", url: "https://x/1.jpg", date: D(9, 1), pose: "front" },
  { id: "p2", clientId: "u1", url: "https://x/2.jpg", date: D(10, 1), pose: "back" },
  { id: "p4", clientId: "u1", url: "https://x/4.jpg", date: D(11, 24) },
];

describe("progress photo helpers (#324)", () => {
  it("oldest first; filter by pose (untagged only under All)", () => {
    expect(sortPhotos(photos).map((p) => p.id)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(filterByPose(photos, "front").map((p) => p.id)).toEqual(["p3", "p1"]);
    expect(filterByPose(photos, "all")).toHaveLength(4);
  });
  it("compares with the earliest of the same pose; the earliest itself with the latest", () => {
    expect(defaultComparison(photos[0], photos).id).toBe("p1"); // Nov front → Sep front
    expect(defaultComparison(photos[1], photos).id).toBe("p3"); // Sep front → latest front
    expect(defaultComparison(photos[3], photos).id).toBe("p1"); // untagged → earliest of all
    expect(defaultComparison(photos[0], [photos[0]])).toBeNull();
  });
  it("days and kg between the two, kg only from real weigh-ins", () => {
    const w = { p1: 75.4, p3: 72 };
    expect(comparisonFigures(photos[1], photos[0], (p) => w[p.id] ?? null)).toEqual({ days: 84, kg: -3.4 });
    expect(comparisonFigures(photos[1], photos[2], (p) => w[p.id] ?? null)).toEqual({ days: 30, kg: null });
  });
});

function setup() {
  const client = { id: "u1", name: "Kate Rose", status: "active", role: "client", createdAt: D(8, 1) };
  ctx = {
    db: {
      users: [client],
      progressPhotos: { u1: photos },
      weighIns: { u1: [{ id: "w1", clientId: "u1", date: D(9, 1), weight: 75.4 }, { id: "w2", clientId: "u1", date: D(11, 24), weight: 72 }] },
      exercises: [], workoutLogs: { u1: [] }, clientPhases: {}, scheduledWorkouts: {}, nutritionLogs: { u1: [] }, habits: {}, habitLog: {},
      liveSessions: {}, workoutComments: {}, clientNotes: {}, messages: {}, forms: [], formSchedules: {}, formResponses: {}, bodyStatsSchedules: {},
      bodyMetrics: {}, videoFeedback: {}, programs: [], appDesign: {},
    },
    currentUser: { id: "coach-1", role: "coach" },
    setProgressPhotoPose: vi.fn(() => Promise.resolve()),
    logWeight: vi.fn(), deleteWeighIn: vi.fn(), logBodyMetric: vi.fn(), deleteBodyMetric: vi.fn(),
  };
  return render(
    <MemoryRouter>
      <CoachClientDetail clientId="u1" onClose={() => {}} showToast={() => {}} initialTab="progress" />
    </MemoryRouter>
  );
}
afterEach(cleanup);

describe("coach Progress Photos (#324)", () => {
  it("filters by pose and labels tagged photos", () => {
    setup();
    const group = screen.getByRole("group", { name: "Filter photos" });
    expect(screen.getAllByLabelText(/^Open photo/)).toHaveLength(4);
    fireEvent.click(within(group).getByText("Back"));
    expect(screen.getAllByLabelText(/^Open photo/)).toHaveLength(1);
    fireEvent.click(within(group).getByText("Side"));
    expect(screen.getByText(/No photos tagged Side yet/)).toBeTruthy();
  });

  it("tapping a photo opens it full screen; tag it, step through, compare two dates", () => {
    setup();
    fireEvent.click(screen.getAllByLabelText(/^Open photo/)[0]); // p3: 24 Nov, front
    const viewer = screen.getByTestId("photo-viewer");
    expect(within(viewer).getByText("24 Nov 2026 · 72kg")).toBeTruthy();
    // Tag Side.
    fireEvent.click(within(within(viewer).getByRole("group", { name: "Pose" })).getByText("Side"));
    expect(ctx.setProgressPhotoPose).toHaveBeenCalledWith("p3", "side");
    // Step to the previous (older) photo.
    fireEvent.click(within(viewer).getByLabelText("Previous photo"));
    expect(within(viewer).getByText(/1 Oct 2026/)).toBeTruthy();
    fireEvent.click(within(viewer).getByLabelText("Next photo"));
    // Compare: 24 Nov front vs the earliest front (1 Sep), 84 days, −3.4 kg.
    fireEvent.click(within(viewer).getByText("Compare"));
    expect(within(screen.getByTestId("compare-left")).getByText(/1 Sept 2026 · 75.4kg · Front/)).toBeTruthy();
    expect(within(screen.getByTestId("compare-right")).getByText(/24 Nov 2026 · 72kg · Front/)).toBeTruthy();
    // #325: big figures — 84 DAYS APART, −3.4 KG CHANGE.
    const figs = screen.getByTestId("compare-figures").textContent;
    expect(figs).toContain("84DAYS APART");
    expect(figs).toContain("−3.4KG CHANGE");
    // Slider layout shows the same pair, Before over After.
    fireEvent.click(within(viewer).getByText("Slider"));
    expect(screen.getByAltText("Before 1 Sept 2026")).toBeTruthy();
    expect(screen.getByAltText("After 24 Nov 2026")).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Before and after" })).toBeTruthy();
    // Pick another date on the left.
    fireEvent.click(within(screen.getByTestId("compare-left")).getByLabelText(/1 Oct 2026 · Back/));
    expect(within(screen.getByTestId("compare-left")).getByText(/1 Oct 2026/)).toBeTruthy();
    fireEvent.click(within(viewer).getByLabelText("Close"));
    expect(screen.queryByTestId("photo-viewer")).toBeNull();
  });
});
