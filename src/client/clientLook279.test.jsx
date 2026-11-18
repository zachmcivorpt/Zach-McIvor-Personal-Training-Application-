// @vitest-environment jsdom
// #279 (owner's mock-up, 2026-11-18: "follow this design… all buttons must
// work"): the coached client Home. Every button on it, clicked in the real
// HomeScreen / top bar with real-shaped data, plus the maths behind the day
// streak and the week's focus.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { localDateKey } from "../lib/dateKey";

vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ({ db: { users: [], workoutLogs: {}, messages: {} } }) }));
import { HomeScreen } from "./ClientApp";
import { ClientChromeContext } from "./ClientLook";
import { sessionStreak, weekFocus, greetingFor } from "./clientLook";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function home(extra = {}, chrome = {}) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const fns = { onSelectDay: vi.fn(), onStartWorkout: vi.fn(), onViewWorkout: vi.fn(), onLogFood: vi.fn(), onLogWater: vi.fn(), onOpenTab: vi.fn(), onLogNutrition: vi.fn(), onLogCardio: vi.fn() };
  const c = { notifCount: 2, onOpenNotifications: vi.fn(), onOpenProfile: vi.fn(), ...chrome };
  const today = localDateKey(new Date());
  render(
    <MemoryRouter>
      <ClientChromeContext.Provider value={c}>
        <HomeScreen
          user={{ id: "u1", name: "Zach McIvor" }} userId="u1" dayOffset={0} isToday
          habits={[{ id: "h1", label: "10k steps" }]} completedHabitIds={[]} dayHabitCompletedIds={[]} onToggleHabit={vi.fn()}
          cardioLogs={[]} challenges={[]} groups={[]}
          targets={{ calories: 2400, protein: 180, carbs: 323, fat: 43, water: 3 }}
          dayNutrition={{ calories: 1678, protein: 122.7, carbs: 201.8, fat: 38.7, water: 0, foods: [{ name: "x" }] }}
          dbReady
          daySession={{ label: "Core & Arms", exercises: [{ exerciseId: "a" }, { exerciseId: "b" }] }}
          weekDot={(k) => (k === today ? "planned" : null)}
          streak={12}
          focus={{ kind: "protein", text: "Hit your protein goal 4 more days this week." }}
          {...fns}
          {...extra}
        />
      </ClientChromeContext.Provider>
    </MemoryRouter>
  );
  return { ...fns, chrome: c };
}

describe("client Home (#279)", () => {
  it("top bar: the mark only (no APEX wordmark); bell with a dot opens notifications; profile opens Profile", () => {
    const { chrome } = home();
    const bar = screen.getByTestId("client-top-bar");
    expect(bar.textContent).not.toMatch(/APEX/);
    expect(within(bar).getByTestId("client-bell-dot")).toBeTruthy();
    fireEvent.click(screen.getByTestId("client-bell"));
    expect(chrome.onOpenNotifications).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("client-profile-button"));
    expect(chrome.onOpenProfile).toHaveBeenCalledTimes(1);
  });

  it("greeting with no emoji; the streak card shows the count and opens Progress", () => {
    const f = home();
    expect(screen.getByTestId("home-greeting-row").textContent).toMatch(/Zach/);
    expect(screen.getByTestId("home-greeting-row").textContent).toMatch(/Stronger than yesterday\./);
    expect(screen.getByTestId("home-greeting-row").textContent).not.toMatch(/💪/);
    expect(screen.getByTestId("home-streak").textContent).toMatch(/12sessions in a row/);
    // #293: the label wraps onto two short lines inside the 156px card — a
    // one-line "sessions in a row" pushed "Keep it going" out of the card.
    const label = screen.getByTestId("home-streak-label");
    expect(label.className).toMatch(/w-\[40px\]/);
    expect(label.className).not.toMatch(/whitespace-nowrap/);
    fireEvent.click(screen.getByTestId("home-streak"));
    expect(f.onOpenTab).toHaveBeenCalledWith("progress");
  });

  it("week strip: blue dot under a training day, blue outline on the chosen day; tapping a day / next week selects it", () => {
    const f = home();
    const strip = screen.getByTestId("client-week-strip");
    const dot = strip.querySelector('[data-dot="planned"] span');
    expect(dot.getAttribute("style")).toMatch(/background-color: (rgb\(47, 143, 255\)|#2F8FFF)/i);
    expect(strip.querySelector('[aria-pressed="true"] span:nth-child(2)').getAttribute("style")).toMatch(/#2F8FFF/i);
    const days = strip.querySelectorAll("[aria-pressed]");
    fireEvent.click(days[6]);
    expect(f.onSelectDay).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(f.onSelectDay).toHaveBeenLastCalledWith(7);
  });

  it("workout card: Start Workout starts, View Plan opens the program, the card itself starts", () => {
    const f = home();
    const hero = screen.getByTestId("client-session-hero");
    expect(hero.textContent).toMatch(/Core & Arms/);
    expect(hero.textContent).toMatch(/2 Exercises/);
    fireEvent.click(screen.getByTestId("home-start-workout"));
    expect(f.onStartWorkout).toHaveBeenCalledTimes(1);
    // #282: View Plan opens the program (Training tab), never the workout.
    fireEvent.click(screen.getByTestId("home-view-plan"));
    expect(f.onOpenTab).toHaveBeenLastCalledWith("workouts");
    expect(f.onViewWorkout).not.toHaveBeenCalled();
    expect(f.onStartWorkout).toHaveBeenCalledTimes(1); // View Plan doesn't also start
    fireEvent.click(hero);
    expect(f.onStartWorkout).toHaveBeenCalledTimes(2);
  });

  it("nutrition: the figures are the day's own; Today opens Nutrition; +250ml / +500ml log water", () => {
    const f = home();
    const card = screen.getByTestId("home-nutrition");
    expect(card.textContent).toMatch(/1,678/);
    expect(card.textContent).toMatch(/122\.7g/);
    expect(card.textContent).toMatch(/\/ 2,400 kcal/);
    fireEvent.click(screen.getByTestId("home-nutrition-open"));
    expect(f.onLogFood).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("home-water-250"));
    expect(f.onLogWater).toHaveBeenLastCalledWith(0.25);
    fireEvent.click(screen.getByTestId("home-water-500"));
    expect(f.onLogWater).toHaveBeenLastCalledWith(0.5);
  });

  it("the four tiles: Log Workout → Training, Log Nutrition → the Nutrition tab, View Progress → Progress, Log Cardio → the cardio sheet", () => {
    const f = home();
    fireEvent.click(screen.getByTestId("home-tile-workout"));
    expect(f.onOpenTab).toHaveBeenLastCalledWith("workouts");
    fireEvent.click(screen.getByTestId("home-tile-nutrition"));
    expect(f.onLogNutrition).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("home-tile-progress"));
    expect(f.onOpenTab).toHaveBeenLastCalledWith("progress");
    expect(screen.queryByTestId("home-tile-calendar")).toBeNull();
    fireEvent.click(screen.getByTestId("home-tile-cardio"));
    fireEvent.click(screen.getByRole("button", { name: /LOG ACTIVITY/ }));
    expect(f.onLogCardio).toHaveBeenCalledTimes(1);
  });

  it("#286: water shows to 2 places — 250 ml is 0.25 L, never 0.3", () => {
    home({ dayNutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0.25 } });
    expect(screen.getByTestId("home-water-amount").textContent).toBe("0.25 / 3 L");
    cleanup();
    home({ dayNutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0.75 } });
    expect(screen.getByTestId("home-water-amount").textContent).toBe("0.75 / 3 L");
  });

  it("#284: the week's focus shows on other days too", () => {
    home({ dayOffset: 1, isToday: false });
    expect(screen.getByTestId("home-focus")).toBeTruthy();
    cleanup();
    home({ dayOffset: -1, isToday: false });
    expect(screen.getByTestId("home-focus")).toBeTruthy();
  });

  it("focus banner opens the tab it's about; Daily Execution is one card and tapping a habit saves it", () => {
    const onToggleHabit = vi.fn(() => Promise.resolve());
    const f = home({ onToggleHabit });
    fireEvent.click(screen.getByTestId("home-focus"));
    expect(f.onOpenTab).toHaveBeenLastCalledWith("nutrition");
    const de = screen.getByTestId("home-daily-execution");
    expect(de.textContent).toMatch(/Daily Execution/);
    expect(de.textContent).toMatch(/10k steps/);
    fireEvent.click(within(de).getByText("10k steps"));
    expect(onToggleHabit).toHaveBeenCalledWith("h1");
  });
});

describe("streak and focus maths (#279)", () => {
  it("greetingFor", () => {
    expect(greetingFor(8)).toBe("Good morning");
    expect(greetingFor(13)).toBe("Good afternoon");
    expect(greetingFor(19)).toBe("Good evening");
  });
  it("#290 sessionStreak: scheduled training sessions done in a row — rest days and today's undone session don't break it, a missed one does", () => {
    const at = (k, h = 9) => new Date(k + "T" + String(h).padStart(2, "0") + ":00:00").getTime();
    const ex = { run: { id: "run", category: "Cardio" }, bench: { id: "bench", category: "Chest" } };
    const sch = (date, label, exId = "bench") => ({ id: date, date, label, exercises: [{ exerciseId: exId }] });
    const scheduled = [sch("2026-11-10", "Push"), sch("2026-11-12", "Pull"), sch("2026-11-14", "Legs"), sch("2026-11-15", "Easy run", "run"), sch("2026-11-16", "Push"), sch("2026-11-17", "Pull"), sch("2026-11-18", "Legs")];
    const logs = [
      { dayLabel: "Push", date: at("2026-11-16") },
      { dayLabel: "Pull", date: at("2026-11-17") },
      { dayLabel: "Legs", date: at("2026-11-15"), scheduledDate: "2026-11-14" }, // Saturday's session caught up on Sunday
      { dayLabel: "Run", date: at("2026-11-15"), cardio: { activityId: "running" } }, // cardio never counts
      { dayLabel: "Push", date: at("2026-11-10") },
    ];
    // Wed 18: today's Legs not done yet → doesn't break; 17 ✓, 16 ✓, 15 is cardio-only (not counted), 14 ✓ (scheduledDate), 12 missed → stop.
    expect(sessionStreak({ logs, scheduled, exercisesById: ex, todayKey: "2026-11-18" })).toBe(3);
    // Do today's session → 4.
    expect(sessionStreak({ logs: [...logs, { dayLabel: "Legs", date: at("2026-11-18") }], scheduled, exercisesById: ex, todayKey: "2026-11-18" })).toBe(4);
    // A different workout logged on Tue 17 doesn't complete Tue's Pull → streak stops at 17 (today undone, 17 missed).
    const wrong = logs.map((l) => (l.dayLabel === "Pull" ? { ...l, dayLabel: "Arms" } : l));
    expect(sessionStreak({ logs: wrong, scheduled, exercisesById: ex, todayKey: "2026-11-18" })).toBe(0);
    // Nothing scheduled → 0; future sessions ignored.
    expect(sessionStreak({ logs, scheduled: [], todayKey: "2026-11-18" })).toBe(0);
    expect(sessionStreak({ logs, scheduled: [...scheduled, sch("2026-11-20", "Push")], exercisesById: ex, todayKey: "2026-11-18" })).toBe(3);
  });
  it("weekFocus: protein days left this week when protein was missed, else sessions left, else nothing", () => {
    const food = (date, protein) => ({ date, meals: { Lunch: [{ name: "x", calories: 100 }] }, calories: 100, protein });
    // Wed 18 Nov: Mon hit (170 ≥ 90% of 180), Tue missed → 5 days left incl. today
    expect(weekFocus({ nutritionLogs: [food("2026-11-16", 170), food("2026-11-17", 100)], proteinTarget: 180, todayKey: "2026-11-18" }).text).toBe("Hit your protein goal 5 more days this week.");
    const both = [food("2026-11-16", 180), food("2026-11-17", 180)];
    expect(weekFocus({ nutritionLogs: both, proteinTarget: 180, scheduledKeys: ["2026-11-18", "2026-11-20", "2026-11-24"], doneKeys: new Set(), todayKey: "2026-11-18" }).text).toBe("2 training sessions left this week — keep it going.");
    expect(weekFocus({ nutritionLogs: both, proteinTarget: 180, scheduledKeys: [], todayKey: "2026-11-18" })).toBeNull();
  });
});
