// @vitest-environment jsdom
// #289 (owner: the calendar "opened then shook the screen and every day is
// now a Sunday" after #287 listed every day): back to listing only days with
// something on them, plus today. Real ClientCalendarScreen.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), useLocation: () => ({ pathname: "/" }), Link: ({ children }) => children }));
vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ({ db: { users: [], workoutLogs: {}, messages: {} }, currentUser: { id: "c1" } }) }));
window.HTMLElement.prototype.scrollIntoView = () => {};
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("client calendar lists only days with something on them (#289)", () => {
  it("Wed (today), Thu 19, Sun 22 — no empty rows for Fri/Sat; each day's own weekday", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-18T10:00:00"));
    const { ClientCalendarScreen } = await import("./ClientApp");
    render(
      <ClientCalendarScreen
        scheduledWorkoutsListByDate={{
          "2026-11-19": [{ id: "s1", date: "2026-11-19", label: "Hypertrophy 1B", exercises: [] }],
          "2026-11-22": [{ id: "s2", date: "2026-11-22", label: "Core & Arms B", exercises: [] }],
        }}
        logsForClient={[]} habits={[]} habitLogForClient={{}} bodyStatsSchedules={[]} weighIns={[]} formSchedules={[]} forms={[]}
        onPreviewWorkout={() => {}} canEdit onMoveItem={() => {}}
      />
    );
    const days = [...document.querySelectorAll("[data-date]")];
    expect(days.map((e) => e.getAttribute("data-date"))).toEqual(["2026-11-18", "2026-11-19", "2026-11-22"]);
    const heads = days.map((e) => e.querySelector('[data-testid="calendar-day-header"]').textContent);
    expect(heads[1]).toMatch(/Thursday/);
    expect(heads[2]).toMatch(/Sunday/);
  });
});
