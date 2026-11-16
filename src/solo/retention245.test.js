// #245: weekly streak, rest day, program finish, monthly story, reminder times.
import { describe, it, expect } from "vitest";
import { weeklyStreak, restDayInfo, programFinish, finishLabel, monthStory, storyMonth, monthStoryWindow, timeLabel, TRAINING_TIMES } from "./retention";

const at = (key, h = 9) => new Date(`${key}T${String(h).padStart(2, "0")}:00:00`).getTime();
const log = (key, extra = {}) => ({ date: at(key), entries: [], ...extra });
// n sessions in the week starting Monday `monday`.
const week = (monday, n) => Array.from({ length: n }, (_, i) => log(new Date(new Date(`${monday}T12:00:00`).getTime() + i * 86400000).toISOString().slice(0, 10)));

describe("weeklyStreak", () => {
  it("counts weeks on target; rest days never break it", () => {
    const logs = [...week("2026-10-19", 3), ...week("2026-10-26", 3), ...week("2026-11-02", 3)];
    expect(weeklyStreak(logs, 3, "2026-11-12")).toEqual({ weeks: 3, spare: 0, sparedWeeks: [] });
  });
  it("this week counts once met, and an unfinished week doesn't break the run", () => {
    const logs = [...week("2026-11-02", 3), ...week("2026-11-09", 1)];
    expect(weeklyStreak(logs, 3, "2026-11-12").weeks).toBe(1);
    expect(weeklyStreak([...logs, ...week("2026-11-12", 2)], 3, "2026-11-14").weeks).toBe(2);
  });
  it("a missed week ends it", () => {
    const logs = [...week("2026-10-19", 3), ...week("2026-10-26", 1), ...week("2026-11-02", 3)];
    expect(weeklyStreak(logs, 3, "2026-11-12").weeks).toBe(1);
  });
  it("every 6 weeks on target earns one spare week that covers a miss", () => {
    const mondays = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"];
    const six = mondays.flatMap((m) => week(m, 2));
    expect(weeklyStreak(six, 2, "2026-10-19")).toMatchObject({ weeks: 6, spare: 1 });
    // 19 Oct missed, then on target again: the spare covers it.
    const after = [...six, ...week("2026-10-26", 2)];
    expect(weeklyStreak(after, 2, "2026-10-30")).toEqual({ weeks: 7, spare: 0, sparedWeeks: ["2026-10-19"] });
    // A second miss with no spare left ends it.
    expect(weeklyStreak([...after, ...week("2026-11-09", 2)], 2, "2026-11-12").weeks).toBe(1);
  });
  it("nothing logged is 0", () => {
    expect(weeklyStreak([], 3, "2026-11-12")).toEqual({ weeks: 0, spare: 0, sparedWeeks: [] });
  });
});

describe("restDayInfo", () => {
  const lib = { bp: { id: "bp", name: "Bench Press", primaryMuscles: ["Chest"], secondaryMuscles: ["Triceps"] } };
  it("lists muscles trained in the last 48 h with hours left, most recent first", () => {
    const now = at("2026-11-12", 18);
    const r = restDayInfo([{ date: at("2026-11-11", 18), entries: [{ exerciseId: "bp", sets: [{ weight: 80, reps: 5 }] }] }], lib, { now });
    expect(r.recovering.map((x) => [x.label, x.hoursLeft])).toEqual([
      ["Chest", 24],
      ["Shoulders", 24],
      ["Triceps", 24],
    ]);
    expect(restDayInfo([], lib, { now }).recovering).toEqual([]);
  });
});

describe("program finish", () => {
  it("is the last day of the final week", () => {
    expect(programFinish("2026-11-02", 8)).toBe("2026-12-27");
    expect(finishLabel("2026-12-27")).toBe("27 Dec");
    expect(programFinish(null, 8)).toBe(null);
  });
});

describe("monthStory", () => {
  const lib = { sq: { id: "sq", name: "Back Squat" } };
  const l = (key, w, r, isPR = false, min = 50) => ({ date: at(key), durationMin: min, entries: [{ exerciseId: "sq", sets: [{ weight: w, reps: r, isPR }] }] });
  it("October in numbers, with gains against the best before October", () => {
    const logs = [l("2026-09-28", 100, 5), l("2026-10-05", 105, 5, true), l("2026-10-07", 100, 5), l("2026-10-12", 107.5, 5, true), l("2026-11-02", 120, 5)];
    const s = monthStory({ logs, exercisesById: lib, month: "2026-10", target: 1 });
    expect(s).toMatchObject({ name: "October", sessions: 3, minutes: 150, volume: 1563, prs: 2, weeksInMonth: 4, weeksOnTarget: 2 });
    // 100×5 → 116.7 before; 107.5×5 → 125.4: +9
    expect(s.gains).toEqual([{ exerciseId: "sq", name: "Back Squat", from: 117, to: 125, gain: 9 }]);
    expect(s.headline).toBe("October: 2 new personal records.");
  });
  it("a quiet month says so", () => {
    expect(monthStory({ logs: [], month: "2026-10" }).headline).toBe("A quiet October. A new month starts today.");
  });
  it("photos: first and last of the month, on different days", () => {
    const photos = [{ id: "a", url: "a", date: at("2026-10-02") }, { id: "b", url: "b", date: at("2026-10-29") }, { id: "c", url: "c", date: at("2026-11-02") }];
    expect(monthStory({ logs: [], photos, month: "2026-10" }).photoPair).toMatchObject({ before: { id: "a" }, after: { id: "b" } });
  });
  it("shows on the 1st to the 3rd, for last month", () => {
    expect(storyMonth("2026-11-01")).toBe("2026-10");
    expect(storyMonth("2027-01-02")).toBe("2026-12");
    expect(monthStoryWindow("2026-11-03")).toBe(true);
    expect(monthStoryWindow("2026-11-04")).toBe(false);
  });
});

describe("training times", () => {
  it("5am to 9pm on the hour", () => {
    expect(TRAINING_TIMES[0]).toBe("05:00");
    expect(TRAINING_TIMES[TRAINING_TIMES.length - 1]).toBe("21:00");
    expect(timeLabel("18:00")).toBe("6pm");
    expect(timeLabel("12:00")).toBe("12pm");
    expect(timeLabel(null)).toBe("Off");
  });
});
