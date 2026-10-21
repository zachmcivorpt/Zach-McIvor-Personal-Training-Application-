// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("../client/ClientApp", () => ({ useClientDark: () => true, formatTargetReps: (r) => String(r) }));

import SoloExerciseBlock from "./SoloExerciseBlock";

const exercise = { id: "e1", name: "Incline Treadmill Walk" };
const rows = [{ kg: "", reps: "", completed: false }];
const noop = () => {};

function renderBlock(exMeta) {
  return render(
    <SoloExerciseBlock exMeta={{ exerciseId: "e1", targetSets: 1, targetReps: 10, section: "main", ...exMeta }} exercise={exercise} rows={rows}
      onChangeField={noop} onBlurKg={noop} onAddSet={noop} onStartRest={noop} onOpenDetail={noop} />
  );
}

// Regression: a 0s rest showed "Rest 0s between sets" with a Start timer
// button that started a pointless zero-length timer (Active Recovery's
// Stationary Cycling).
afterEach(cleanup);

describe("SoloExerciseBlock rest row", () => {
  it("is hidden when the exercise has no rest", () => {
    renderBlock({ restSeconds: 0 });
    expect(screen.queryByText(/between sets/)).toBeNull();
    expect(screen.queryByText("Start timer")).toBeNull();
  });
  it("still shows for a real rest", () => {
    renderBlock({ restSeconds: 60 });
    expect(screen.getByText("Rest 60s between sets")).toBeTruthy();
    expect(screen.getByText("Start timer")).toBeTruthy();
  });
  it("defaults to 90s when unset", () => {
    renderBlock({});
    expect(screen.getByText("Rest 90s between sets")).toBeTruthy();
  });
});
