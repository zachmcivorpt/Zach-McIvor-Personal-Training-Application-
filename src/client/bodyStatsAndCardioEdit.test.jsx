// @vitest-environment jsdom
//
// Coached client app: one sheet logs a whole body-stats check-in (weight,
// body fat, lean mass, measurements, photos), and a logged cardio session
// can be edited by tapping it on Home.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { localDateKey } from "../lib/dateKey";

vi.setConfig({ testTimeout: 30000 });
afterEach(() => cleanup());

const load = () => import("./ClientApp");

describe("Log Body Stats sheet", () => {
  it("saves only the fields filled in, all on the chosen date", async () => {
    const { BodyStatsCheckInSheet } = await load();
    const onSave = vi.fn();
    render(<BodyStatsCheckInSheet open onClose={() => {}} onSave={onSave} lastValues={{ weight: 82.4 }} />);
    const save = screen.getByRole("button", { name: /SAVE CHECK-IN/ });
    expect(save.disabled).toBe(true); // nothing entered yet
    expect(screen.getByPlaceholderText("Last: 82.4")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Last: 82.4"), { target: { value: "81.9" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 18.5"), { target: { value: "17.2" } });
    fireEvent.click(screen.getByText(/Add measurements/));
    fireEvent.change(screen.getByPlaceholderText("e.g. 84"), { target: { value: "83" } });
    fireEvent.click(save);

    expect(onSave).toHaveBeenCalledWith({ dateKey: localDateKey(), weight: 81.9, metrics: { bodyFatPct: 17.2, waistCm: 83 }, files: [] });
  });

  it("won't save a zero or negative number", async () => {
    const { BodyStatsCheckInSheet } = await load();
    const onSave = vi.fn();
    render(<BodyStatsCheckInSheet open onClose={() => {}} onSave={onSave} lastValues={{}} />);
    fireEvent.change(screen.getByPlaceholderText("e.g. 82.4"), { target: { value: "0" } });
    expect(screen.getByText("Enter numbers greater than 0")).toBeTruthy();
    expect(screen.getByRole("button", { name: /SAVE CHECK-IN/ }).disabled).toBe(true);
  });
});

describe("Editing a logged cardio session", () => {
  const log = { id: "log1", entries: [], cardio: { activityId: "cycling", activityLabel: "Cycling", durationMin: 45, distanceKm: 20, caloriesBurned: 400 } };

  it("tapping the session opens it filled in, and saving sends the changes", async () => {
    const { CardioLogCard } = await load();
    const onUpdate = vi.fn();
    render(<CardioLogCard logs={[log]} onDelete={() => {}} onUpdate={onUpdate} />);
    const row = screen.getByRole("button", { name: "Edit Cycling" });
    fireEvent.pointerDown(row, { clientX: 100 });
    fireEvent.click(row, { clientX: 100 });

    expect(screen.getByText("Edit Activity")).toBeTruthy();
    expect(screen.getByDisplayValue("45")).toBeTruthy();
    expect(screen.getByDisplayValue("20")).toBeTruthy();
    fireEvent.click(screen.getByText("Running"));
    fireEvent.click(screen.getByRole("button", { name: /SAVE CHANGES/ }));

    expect(onUpdate).toHaveBeenCalledWith(log, { activityId: "running", activityLabel: "Running", durationMin: 45, distanceKm: 20, caloriesBurned: 400 });
  });

  it("a swipe doesn't open the editor", async () => {
    const { CardioLogCard } = await load();
    render(<CardioLogCard logs={[log]} onDelete={() => {}} onUpdate={vi.fn()} />);
    const row = screen.getByRole("button", { name: "Edit Cycling" });
    fireEvent.pointerDown(row, { clientX: 300 });
    fireEvent.click(row, { clientX: 120 });
    expect(screen.queryByText("Edit Activity")).toBeNull();
  });
});
