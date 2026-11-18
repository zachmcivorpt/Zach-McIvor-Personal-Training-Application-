// @vitest-environment jsdom
// #287 (owner: "why does my calendar skip 3 days?"): the client calendar
// listed only days with something on them, so Thu 19 jumped to Sun 22 (and
// a workout could never be dragged onto a free day). Every day is listed
// now; an empty one says "Rest day". Real ClientCalendarScreen.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), useLocation: () => ({ pathname: "/" }), Link: ({ children }) => children }));
vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ({ db: { users: [], workoutLogs: {}, messages: {} }, currentUser: { id: "c1" } }) }));
window.HTMLElement.prototype.scrollIntoView = () => {};
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("client calendar lists every day (#287)", () => {
  it("Thu 19 → Fri 20 → Sat 21 → Sun 22, the empty days as rest days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-18T10:00:00"));
    const { ClientCalendarScreen } = await import("./ClientApp");
    render(
      <ClientCalendarScreen
        scheduledWorkoutsListByDate={{
          "2026-11-19": [{ id: "s1", date: "2026-11-19", label: "Hypertrophy 1B", exercises: [] }],
          "2026-11-22": [{ id: "s2", date: "2026-11-22", label: "Core & Arms B", exercises: [] }],
        }}
        logsForClient={[]}
        habits={[]}
        habitLogForClient={{}}
        bodyStatsSchedules={[]}
        weighIns={[]}
        formSchedules={[]}
        forms={[]}
        onPreviewWorkout={() => {}}
        canEdit
        onMoveItem={() => {}}
      />
    );
    const dates = [...document.querySelectorAll("[data-date]")].map((e) => e.getAttribute("data-date"));
    const i = dates.indexOf("2026-11-19");
    expect(dates.slice(i, i + 4)).toEqual(["2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    const rest = (k) => document.querySelector(`[data-date="${k}"] [data-testid="calendar-rest-day"]`);
    expect(rest("2026-11-20").textContent).toBe("Rest day");
    expect(rest("2026-11-21")).toBeTruthy();
    expect(rest("2026-11-19")).toBeNull();
    expect(screen.getByText("Hypertrophy 1B")).toBeTruthy();
  });
});
