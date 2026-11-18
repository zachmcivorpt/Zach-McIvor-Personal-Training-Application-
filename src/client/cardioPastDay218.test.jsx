// @vitest-environment jsdom
// #218: Home on a past day can log cardio — since #284 through the "Log Cardio"
// tile (on every day), not a separate "Log a cardio session" row.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import fs from "node:fs";

vi.setConfig({ testTimeout: 30000 });
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), useLocation: () => ({ pathname: "/" }) }));
afterEach(() => cleanup());
window.HTMLElement.prototype.scrollIntoView = () => {};

const props = (over) => ({
  user: { id: "c1", name: "Jarrod Kolsch" },
  habits: [],
  completedHabitIds: [],
  onToggleHabit: () => {},
  nutrition: null,
  targets: {},
  activeLog: null,
  onStartWorkout: () => {},
  onAvatarClick: () => {},
  showToast: () => {},
  onSelectDay: () => {},
  daySession: null,
  completedOnDate: false,
  dayHabitCompletedIds: [],
  exercisesById: {},
  bodyStatsDueToday: false,
  notifCount: 0,
  challenges: [],
  userId: "c1",
  cardioLogs: [],
  dbReady: true,
  groups: [],
  ...over,
});

describe("Log cardio on a past day from Home (#218)", () => {
  it("a past day shows it and logs through onLogCardio", async () => {
    const { HomeScreen } = await import("./ClientApp");
    const onLogCardio = vi.fn();
    render(<HomeScreen {...props({ dayOffset: -2, isToday: false, onLogCardio })} />);
    fireEvent.click(screen.getByTestId("home-tile-cardio"));
    fireEvent.click(screen.getByRole("button", { name: /LOG ACTIVITY/ }));
    expect(onLogCardio).toHaveBeenCalledWith(expect.objectContaining({ activityId: "running", durationMin: 30 }));
  });

  it("#284: no stray \"Log a cardio session\" row on any day; the tile is there on every day", async () => {
    const { HomeScreen } = await import("./ClientApp");
    render(<HomeScreen {...props({ dayOffset: 0, isToday: true, onLogCardio: vi.fn() })} />);
    expect(screen.queryByRole("button", { name: /Log a cardio session/ })).toBeNull();
    cleanup();
    render(<HomeScreen {...props({ dayOffset: 2, isToday: false, onLogCardio: vi.fn() })} />);
    expect(screen.queryByRole("button", { name: /Log a cardio session/ })).toBeNull();
    cleanup();
    render(<HomeScreen {...props({ dayOffset: -2, isToday: false, onLogCardio: vi.fn() })} />);
    expect(screen.queryByRole("button", { name: /Log a cardio session/ })).toBeNull();
    expect(screen.getByTestId("home-tile-cardio")).toBeTruthy();
  });

  it("saves on the day shown, at midday", () => {
    const src = fs.readFileSync("src/client/ClientApp.jsx", "utf8");
    expect(src).toMatch(/selectedDateKey\.split\("-"\)\.map\(Number\);\s*logWorkout\(currentUser\.id, \{[\s\S]{0,120}cardio, date: selectedDateKey > todayDateKey \? Date\.now\(\) : new Date\(y, m - 1, d, 12, 0, 0\)\.getTime\(\) \}\)/);
  });
});
