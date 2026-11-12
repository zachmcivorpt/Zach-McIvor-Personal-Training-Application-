// @vitest-environment jsdom
// #223: talking points from a scan of the week (editable, coach-only), red
// dots for missed sessions / calories / protein, and every macro green/red
// on the Nutrition tab.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { buildTalkingPoints, mergeTalkingPoints } from "./talkingPoints";
import { nutritionWeek, weekScorecard } from "./clientSnapshot";
import { DayGrid, TalkingPoints } from "./WeeklyScorecard";
import { localDateKey } from "../../lib/dateKey";

afterEach(() => cleanup());
const NOW = new Date(2026, 10, 12, 10).getTime();
const key = (d) => localDateKey(new Date(2026, 10, d, 12));
const targets = { calories: 2400, protein: 180, carbs: 323, fat: 43 };
// The owner's real week from the screenshot (Thu 5 – Wed 11 Nov).
const logs = [
  [5, 3003, 177, 300, 60],
  [6, 406, 56, 40, 10],
  [8, 806, 80, 90, 20],
  [9, 1947, 156, 200, 45],
  [10, 1316, 101, 150, 40],
  [11, 1529, 119, 160, 44],
].map(([d, calories, protein, carbs, fat]) => ({ date: key(d), calories, protein, carbs, fat, meals: { Breakfast: [{}] } }));

describe("macro hits (#223)", () => {
  const n = nutritionWeek(logs, targets, NOW);
  it("carbs and fat are hit within 15% either way", () => {
    const by = Object.fromEntries(n.days.map((d) => [d.dateKey, d]));
    expect(by[key(5)].carbHit).toBe(true); // 300 vs 323 (−7%)
    expect(by[key(9)].carbHit).toBe(false); // 200 vs 323
    expect(by[key(9)].fatHit).toBe(true); // 45 vs 43
    expect(by[key(5)].fatHit).toBe(false); // 60 vs 43 (+40%)
    expect(by[key(7)].logged).toBe(false);
    expect(n).toMatchObject({ loggedCount: 6, calorieHits: 0, proteinHits: 1, carbHits: 1, fatHits: 3 });
  });
});

describe("talking points (#223)", () => {
  const week = weekScorecard({
    workoutLogs: [{ date: new Date(2026, 10, 9, 9).getTime(), entries: [] }],
    scheduledWorkouts: [{ date: key(9) }, { date: key(10) }],
    nutritionLogs: logs,
    bodyMetrics: [{ date: key(5), steps: 1522 }],
    weighIns: [],
    targets,
    exercisesById: {},
    now: NOW,
  });
  const nutrition = nutritionWeek(logs, targets, NOW);
  const changes = { keyChanges: [{ id: "s", label: "Stress", prev: 2, now: 4, delta: 2 }] };
  const points = buildTalkingPoints({ week, nutrition, targets, changes });
  const text = points.map((p) => p.text).join("\n");

  it("flags the real problems with the real figures", () => {
    expect(text).toMatch(/Missed 1 of 2 planned sessions \(Tue\)/);
    expect(text).toMatch(/On calorie target 0 of 7 days — averaging 1,501 vs 2,400 kcal \(−899\)/);
    expect(text).toMatch(/Protein hit 1 of 7 days — averaging 115 g vs 180 g/);
    expect(text).toMatch(/Carbs averaging 157 g vs 323 g \(49% of target\)/);
    expect(text).toMatch(/Steps averaged 1,522 a day \(goal 10,000\) — only 1 day recorded/);
    expect(text).toMatch(/Check-in: Stress up 2 → 4/);
    expect(points.every((p) => p.kind === "focus")).toBe(true);
  });

  it("a rescan keeps the coach's edits, own notes and removals", () => {
    const current = [
      { ...points[0], text: "Talk about Tuesday", edited: true },
      { ...points[1], removed: true },
      { id: "coach_1", text: "Ask about work trip", source: "coach", kind: "focus" },
    ];
    const merged = mergeTalkingPoints(current, points);
    expect(merged.find((p) => p.id === points[0].id).text).toBe("Talk about Tuesday");
    expect(merged.find((p) => p.id === points[1].id).removed).toBe(true);
    expect(merged.some((p) => p.id === "coach_1")).toBe(true);
    expect(merged.filter((p) => p.id === points[2].id)).toHaveLength(1);
  });

  it("the coach can edit, remove and add points", () => {
    const onChange = vi.fn();
    render(<TalkingPoints points={points} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Talking point 1"), { target: { value: "Edited" } });
    expect(onChange.mock.calls[0][0][0]).toMatchObject({ text: "Edited", edited: true });
    fireEvent.click(screen.getByLabelText("Remove talking point 2"));
    expect(onChange.mock.calls[1][0][1].removed).toBe(true);
    fireEvent.change(screen.getByLabelText("Add a talking point"), { target: { value: "Ask about sleep" } });
    fireEvent.click(screen.getByLabelText("Add note"));
    expect(onChange.mock.calls[2][0][0]).toMatchObject({ text: "Ask about sleep", source: "coach" });
  });

  it("missed sessions, calories and protein are red dots; days not logged are a dash", () => {
    const { container } = render(<DayGrid week={week} />);
    const grid = container.querySelector("[data-testid=day-grid]");
    // Tue 10: planned, not done → red. Sat 7: no food logged → dashes.
    expect(grid.querySelectorAll("[data-dot=missed]").length).toBeGreaterThan(0);
    expect(grid.querySelectorAll("[data-dot=missed]").length).toBe(1 + 6 + 5); // 1 session + calories 6 logged/0 hit + protein 6 logged/1 hit
    for (const el of grid.querySelectorAll("[data-dot=missed]")) expect(el.style.background).toMatch(/239, 68, 68|#EF4444/i);
  });
});
