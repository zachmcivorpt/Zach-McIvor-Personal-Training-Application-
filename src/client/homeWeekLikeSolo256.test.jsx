// @vitest-environment jsdom
// #256 (owner): Home's week and session are Train Solo's exactly — no
// greeting; the day heading with Today and week arrows; one glass box
// Monday–Sunday with weekday letters, the chosen day ringed and a blue dot
// under training days; the session as Train Solo's photo card with the
// ring Start.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { localDateKey } from "../lib/dateKey";

vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ({ db: { users: [], workoutLogs: {}, messages: {} } }) }));
import { HomeScreen } from "./ClientApp";
afterEach(cleanup);

function home(extra = {}) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const onSelectDay = vi.fn();
  const onStartWorkout = vi.fn();
  const today = localDateKey(new Date());
  render(
    <MemoryRouter>
      <HomeScreen
        user={{ id: "u1", name: "Zach McIvor" }} userId="u1" dayOffset={0} onSelectDay={onSelectDay} isToday
        habits={[]} completedHabitIds={[]} dayHabitCompletedIds={[]} cardioLogs={[]} challenges={[]} groups={[]}
        targets={{ calories: 2000 }} dayNutrition={null} dbReady
        daySession={{ label: "Glute Growth", exercises: [{ exerciseId: "a" }, { exerciseId: "b" }] }}
        onStartWorkout={onStartWorkout}
        phaseLabel="Hourglass Method · Week 2"
        weekDot={(k) => (k === today ? "planned" : null)}
        {...extra}
      />
    </MemoryRouter>
  );
  return { onSelectDay, onStartWorkout };
}

describe("Home week + session like Train Solo (#256)", () => {
  it("no greeting; week strip in one glass box with a dot under today's session; arrows move a week", () => {
    const { onSelectDay } = home();
    expect(screen.getByText(/Good (morning|afternoon|evening)/)).toBeTruthy(); // #279
    const strip = screen.getByTestId("client-week-strip");
    expect(strip.querySelectorAll("[aria-pressed]")).toHaveLength(7);
    // #279: the chosen day is a solid circle with a blue outline; a planned day a blue dot.
    expect(strip.querySelector('[aria-pressed="true"] span:nth-child(2)').getAttribute("style")).toMatch(/box-shadow:.*3\.5px/);
    expect(strip.querySelectorAll('[data-dot="planned"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(onSelectDay).toHaveBeenCalledWith(7);
  });
  it("the session is Train Solo's photo card: blue program line, name, exercises, ring Start", () => {
    const { onStartWorkout } = home();
    const hero = screen.getByTestId("client-session-hero");
        expect(hero.textContent).toMatch(/Glute Growth/);
    expect(hero.textContent).toMatch(/2 Exercises/); // #279 mock-up wording
    expect(hero.textContent).toMatch(/Start/);
    fireEvent.click(hero);
    expect(onStartWorkout).toHaveBeenCalledTimes(1);
  });
});
