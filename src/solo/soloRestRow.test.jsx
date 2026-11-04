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

// #170 (owner): the Start timer button is the client app's blue
// (MEASURE_BLUE), not the coach's Train Solo branding accent (it was slate
// grey); and Reps sit left of Kg, like "Previous" and "Target".
describe("SoloExerciseBlock look (#170)", () => {
  async function renderThemed() {
    vi.resetModules();
    vi.doMock("../lib/SoloAppContext", () => ({ useSoloApp: () => ({ soloBranding: { accent: "slate" }, soloProfileMissing: false }) }));
    vi.doMock("../client/ClientApp", () => ({ useClientDark: () => true, formatTargetReps: (r) => String(r) }));
    const { MemoryRouter } = await import("react-router-dom");
    const { SoloThemeProvider } = await import("./SoloThemeContext");
    const { default: Block } = await import("./SoloExerciseBlock");
    return render(
      <MemoryRouter initialEntries={["/solo/workout"]}>
        <SoloThemeProvider>
          <Block exMeta={{ exerciseId: "e1", targetSets: 1, targetReps: 10, section: "main", restSeconds: 60 }} exercise={exercise} rows={rows}
            onChangeField={noop} onBlurKg={noop} onAddSet={noop} onStartRest={noop} onOpenDetail={noop} />
        </SoloThemeProvider>
      </MemoryRouter>
    );
  }

  it("Start timer is MEASURE_BLUE whatever the branding accent", async () => {
    await renderThemed();
    expect(screen.getByText("Start timer").closest("span").style.backgroundColor).toBe("rgb(47, 143, 255)");
  });

  it("Reps comes before Kg, in the header and the inputs", async () => {
    const { container } = await renderThemed();
    const header = [...container.querySelectorAll("span")].map((s) => s.textContent).filter((x) => x === "REPS" || x === "KG");
    expect(header).toEqual(["REPS", "KG"]);
    const inputs = [...container.querySelectorAll("input")].map((i) => i.getAttribute("inputmode"));
    expect(inputs).toEqual(["numeric", "decimal"]);
  });
});
