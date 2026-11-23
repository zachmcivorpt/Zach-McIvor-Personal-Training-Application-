// @vitest-environment jsdom
// #326 (owner, 2026-11-24): the Log Body Stats sheet's photos use the SAME
// Add Front / Add Side / Add Back and the same guide as Progress Photos, and
// each photo is saved with its pose.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { localDateKey } from "../lib/dateKey";
import { POSE_GUIDE } from "../lib/progressPhotos";

vi.setConfig({ testTimeout: 30000 });
afterEach(cleanup);
globalThis.URL.createObjectURL = globalThis.URL.createObjectURL || (() => "blob:x");
globalThis.URL.revokeObjectURL = globalThis.URL.revokeObjectURL || (() => {});

describe("Log Body Stats photos match Progress Photos (#326)", () => {
  it("Add Front / Side / Back open the same guide; photos are saved with their pose", async () => {
    const { BodyStatsCheckInSheet } = await import("./ClientApp");
    const onSave = vi.fn();
    render(<BodyStatsCheckInSheet open onClose={() => {}} onSave={onSave} lastValues={{}} />);
    const slots = screen.getByTestId("pose-slots");
    for (const p of ["Add Front", "Add Side", "Add Back"]) expect(within(slots).getByRole("button", { name: p })).toBeTruthy();

    fireEvent.click(within(slots).getByRole("button", { name: "Add Back" }));
    const guide = screen.getByTestId("pose-guide");
    for (const step of POSE_GUIDE.back.steps) expect(within(guide).getByText(step)).toBeTruthy();
    expect(within(guide).queryByText("Date taken")).toBeNull(); // the sheet's own date is used
    const file = new File(["x"], "back.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("pose-library-input"), { target: { files: [file] } });
    fireEvent.click(within(screen.getByTestId("pose-guide")).getByText("Done"));

    expect(within(screen.getByTestId("pose-slots")).getByRole("button", { name: "Remove Back photo" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /SAVE CHECK-IN/ }));
    expect(onSave).toHaveBeenCalledWith({ dateKey: localDateKey(), weight: null, metrics: {}, files: [{ file, pose: "back" }] });
  });
});
