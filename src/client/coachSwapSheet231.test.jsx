// @vitest-environment jsdom
// #231: in View as Client the swap opens a full-screen picker (no keyboard
// on open) and asks "Swap in training phase" / "This session only".
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import fs from "node:fs";

vi.setConfig({ testTimeout: 30000 });
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), useLocation: () => ({ pathname: "/" }) }));
afterEach(() => cleanup());

const exercise = { id: "row", name: "Cable Seated Wide Grip Row", category: "Back", equipment: "Cable" };
const all = [exercise, { id: "dbrow", name: "Dumbbell Single Arm Row", category: "Back", equipment: "Dumbbell" }, { id: "tbar", name: "Single-Arm T-Bar Row", category: "Back", equipment: "Barbell" }];
const props = (over) => ({ exMeta: { exerciseId: "row" }, exercise, allExercises: all, onClose: vi.fn(), onConfirm: vi.fn(), ...over });

describe("Coach swap in View as Client (#231)", () => {
  it("full-screen picker; the search doesn't grab the keyboard", async () => {
    const { SwapExerciseSheet } = await import("./ClientApp");
    render(<SwapExerciseSheet {...props({ onSwapInPhase: vi.fn() })} />);
    const search = screen.getByLabelText("Search exercises");
    expect(document.activeElement).not.toBe(search);
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    fireEvent.change(search, { target: { value: "single arm" } });
    expect(screen.getByText("Dumbbell Single Arm Row")).toBeTruthy();
    expect(screen.queryByText("Why the swap?")).toBeNull();
  });

  it("Swap in training phase updates the program and the session", async () => {
    const { SwapExerciseSheet } = await import("./ClientApp");
    const onSwapInPhase = vi.fn();
    const onConfirm = vi.fn();
    render(<SwapExerciseSheet {...props({ onSwapInPhase, onConfirm })} />);
    fireEvent.click(screen.getByText("Dumbbell Single Arm Row"));
    fireEvent.click(screen.getByText("Swap in training phase"));
    expect(onSwapInPhase).toHaveBeenCalledWith("row", expect.objectContaining({ id: "dbrow" }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ id: "dbrow" }), expect.any(String));
  });

  it("This session only leaves the program alone", async () => {
    const { SwapExerciseSheet } = await import("./ClientApp");
    const onSwapInPhase = vi.fn();
    const onConfirm = vi.fn();
    render(<SwapExerciseSheet {...props({ onSwapInPhase, onConfirm })} />);
    fireEvent.click(screen.getByText("Single-Arm T-Bar Row"));
    fireEvent.click(screen.getByText("This session only"));
    expect(onSwapInPhase).not.toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ id: "tbar" }), "");
  });

  it("a real client still gets the old sheet with the reason step; only View as Client gets the phase option", async () => {
    const { SwapExerciseSheet } = await import("./ClientApp");
    render(<SwapExerciseSheet {...props()} />);
    fireEvent.click(screen.getByText("Dumbbell Single Arm Row"));
    expect(screen.getByText("Why the swap?")).toBeTruthy();
    const src = fs.readFileSync("src/client/ClientApp.jsx", "utf8");
    expect(src).toMatch(/onSwapInPhase=\{\s*viewingAsClient\s*\?/);
  });
});
