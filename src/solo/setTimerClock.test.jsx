// @vitest-environment jsdom
//
// Register #101: the set timer on timed exercises (coached app and Train
// Solo) counts down from the phone's clock, not by ticks. Ticks stall when
// the phone is busy (the connection dropping in and out, the app being
// backgrounded); here the clock moves 20s while only one tick gets through,
// and the timer must still read 10s left, then finish and log 30s.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../client/ClientApp", async (orig) => {
  const real = await orig();
  return { ...real, useClientDark: () => true };
});
vi.mock("./timerAudio", () => ({ playTimerDing: vi.fn(), unlockTimerAudio: vi.fn() }));
vi.mock("../lib/AppContext", () => ({
  useApp: () => ({ db: { workoutComments: {} }, currentUser: { id: "c" } }),
  getPreviousSets: () => [],
  estimate1RM: () => 0,
  getBestEverStats: () => ({}),
  getCurrentPhase: () => null,
}));
vi.mock("../lib/push", () => ({ enablePush: vi.fn(), disablePush: vi.fn(), pushSupported: vi.fn() }));
vi.mock("../lib/storage", () => ({ uploadMessageVideo: vi.fn(), uploadMessagePdf: vi.fn(), uploadMessageImage: vi.fn(), uploadMessageAudio: vi.fn() }));

import SoloExerciseBlock from "./SoloExerciseBlock";
import { WorkoutSession } from "../client/ClientApp";

let clock = 0;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval"] });
  clock = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const exercise = { id: "e1", name: "Plank" };
const timedMeta = { exerciseId: "e1", section: "main", targetSets: 1, targetReps: 30, targetType: "time", restSeconds: 0 };

async function stallThenCatchUp() {
  // 20 real seconds pass but the phone only lets one tick through.
  clock += 20_000;
  await act(async () => vi.advanceTimersByTime(250));
}

describe("set timer keeps real time when ticks stall", () => {
  it("Train Solo", async () => {
    const onChangeField = vi.fn();
    render(
      <SoloExerciseBlock exMeta={timedMeta} exercise={exercise} rows={[{ weight: "", reps: "" }]} onChangeField={onChangeField} onBlurKg={() => {}} onAddSet={() => {}} onStartRest={() => {}} onOpenDetail={() => {}} />
    );
    fireEvent.click(screen.getByText("Start"));
    await stallThenCatchUp();
    expect(screen.getByText("10s — stop")).toBeTruthy();
    clock += 10_000;
    await act(async () => vi.advanceTimersByTime(250));
    expect(onChangeField).toHaveBeenCalledWith(0, "reps", "30");
  });

  it("coached app", async () => {
    const setActiveLog = vi.fn();
    render(
      <WorkoutSession
        session={{ id: "s1", date: "2026-10-28", label: "Day", exercises: [timedMeta] }}
        activeLog={{}}
        setActiveLog={setActiveLog}
        logsForClient={[]}
        exercisesById={{ e1: exercise }}
        exerciseNotes={{}}
        setExerciseNotes={() => {}}
        allExercises={[exercise]}
        exerciseSwaps={{}}
        setExerciseSwaps={() => {}}
        extraExercises={[]}
        setExtraExercises={() => {}}
        onFinish={() => {}}
        finishing={false}
        onExit={() => {}}
        onSaveNote={() => {}}
        clientId="c"
        onLiveUpdate={() => {}}
        sessionNote=""
        onChangeSessionNote={() => {}}
        onSaveSessionNote={() => {}}
      />
    );
    fireEvent.click(screen.getByText("30s"));
    await stallThenCatchUp();
    expect(screen.getByText("10s")).toBeTruthy();
  });
});
