// @vitest-environment jsdom
//
// Train Solo set rows read kg first, reps second, everywhere in the row:
// the KG box on the left, REPS on the right, and the Previous / Target
// text in the same order ("60 kg × 10"), so the figures line up with the
// boxes they fill.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("../client/ClientApp", () => ({ useClientDark: () => true, formatTargetReps: (r) => String(r.targetReps) }));

import SoloExerciseBlock from "./SoloExerciseBlock";

afterEach(cleanup);
const noop = () => {};

function renderBlock(props = {}) {
  return render(
    <SoloExerciseBlock exMeta={{ exerciseId: "e1", targetSets: 1, targetReps: 10, section: "main" }} exercise={{ id: "e1", name: "Bench Press" }}
      rows={[{ weight: "", reps: "", completed: false }]} onSwap={noop} onChangeField={noop} onBlurKg={noop} onAddSet={noop} onStartRest={noop} onOpenDetail={noop} {...props} />
  );
}

describe("Train Solo set row order: kg left, reps right", () => {
  it("KG box comes before the REPS box, headers and inputs alike", () => {
    const { container } = renderBlock();
    const kg = screen.getByText("KG");
    const reps = screen.getByText("REPS");
    expect(kg.compareDocumentPosition(reps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const inputs = container.querySelectorAll("input");
    expect(inputs[0].getAttribute("inputmode")).toBe("decimal");
    expect(inputs[1].getAttribute("inputmode")).toBe("numeric");
  });

  it("Previous and Target read kg first", () => {
    renderBlock({ previousSets: [{ weight: 60, reps: 10 }], targets: [{ weight: 62.5, reps: 10 }] });
    expect(screen.getByText("60 kg × 10")).toBeTruthy();
    expect(screen.getByText("Target 62.5 kg × 10")).toBeTruthy();
  });

  it("a bodyweight target still reads in reps", () => {
    renderBlock({ previousSets: [{ weight: 0, reps: 12 }], targets: [{ weight: 0, reps: 12 }] });
    expect(screen.getByText("Target 12 reps")).toBeTruthy();
  });
});
