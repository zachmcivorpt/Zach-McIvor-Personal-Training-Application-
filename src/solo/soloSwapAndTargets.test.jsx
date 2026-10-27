// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../client/ClientApp", () => ({ useClientDark: () => true, formatTargetReps: (r) => String(r.targetReps) }));

import SoloExerciseBlock from "./SoloExerciseBlock";
import { planExerciseTargets, targetReasonText } from "./soloProgression";

afterEach(cleanup);
const noop = () => {};

describe("Train Solo exercise block: swap and set targets", () => {
  it("shows a target per set with its reason, and tapping it fills the set", () => {
    const onChangeField = vi.fn();
    const previousSets = [{ weight: 60, reps: 10 }];
    const targets = planExerciseTargets(previousSets, 10, 1);
    render(
      <SoloExerciseBlock exMeta={{ exerciseId: "e1", targetSets: 1, targetReps: 10, section: "main" }} exercise={{ id: "e1", name: "Bench Press" }}
        rows={[{ weight: "", reps: "", completed: false }]} previousSets={previousSets} targets={targets} targetReason={targetReasonText(targets[0], 10)}
        onSwap={noop} onChangeField={onChangeField} onBlurKg={noop} onAddSet={noop} onStartRest={noop} onOpenDetail={noop} />
    );
    expect(screen.getByText("You hit your reps last time, so the weight goes up.")).toBeTruthy();
    fireEvent.click(screen.getByText("Target 10 × 62.5kg"));
    expect(onChangeField).toHaveBeenCalledWith(0, "weight", "62.5");
    expect(onChangeField).toHaveBeenCalledWith(0, "reps", "10");
  });

  it("has a swap button, and says what a swapped exercise replaced", () => {
    const onSwap = vi.fn();
    render(
      <SoloExerciseBlock exMeta={{ exerciseId: "e2", targetSets: 1, targetReps: 10, section: "main" }} exercise={{ id: "e2", name: "Dumbbell Press" }}
        rows={[{ weight: "", reps: "", completed: false }]} swappedFromName="Bench Press"
        onSwap={onSwap} onChangeField={noop} onBlurKg={noop} onAddSet={noop} onStartRest={noop} onOpenDetail={noop} />
    );
    expect(screen.getByText("Swapped from Bench Press")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Swap Dumbbell Press" }));
    expect(onSwap).toHaveBeenCalled();
  });
});
