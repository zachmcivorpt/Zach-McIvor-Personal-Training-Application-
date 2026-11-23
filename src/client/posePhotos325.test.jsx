// @vitest-environment jsdom
// #325 (owner, 2026-11-24): the coached client adds progress photos as Add
// Front / Add Side / Add Back, each with a full-screen guide, and the pose is
// saved with the photo; then sees first vs latest per pose with days and kg.
// Renders the REAL ProgressScreen; Train Solo's section (no `poses`) is unchanged.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("../lib/image", () => ({ fileToCompressedDataUrl: vi.fn(async () => "data:image/jpeg;base64,AAA") }));
import { ProgressScreen, PhotosSection } from "./ClientApp";
import { firstAndLatest, POSE_GUIDE } from "../lib/progressPhotos";

afterEach(cleanup);
const D = (m, d) => new Date(2026, m - 1, d, 9).getTime();

function renderProgress(photos = [], onAddPhoto = vi.fn(), weighIns = []) {
  render(
    <ProgressScreen
      userId="c1"
      photos={photos}
      onAddPhoto={onAddPhoto}
      onDeletePhoto={() => {}}
      weighIns={weighIns}
      onLogWeight={() => {}}
      onDeleteWeighIn={() => {}}
      logsForClient={[]}
      exercisesById={{}}
      bodyMetrics={[]}
      onLogBodyMetric={() => {}}
      onDeleteBodyMetric={() => {}}
      scheduledWorkouts={[]}
    />
  );
  return onAddPhoto;
}

describe("client Add Front / Side / Back (#325)", () => {
  it("shows three clear options", () => {
    renderProgress();
    const tiles = screen.getByTestId("pose-tiles");
    for (const p of ["Add Front", "Add Side", "Add Back"]) expect(within(tiles).getByRole("button", { name: p })).toBeTruthy();
  });

  it("each opens its guide with instructions; a photo is saved WITH its pose, then the next pose opens", async () => {
    const onAddPhoto = renderProgress();
    fireEvent.click(screen.getByRole("button", { name: "Add Side" }));
    const guide = screen.getByTestId("pose-guide");
    expect(within(guide).getByRole("heading", { name: "Side" })).toBeTruthy();
    for (const step of POSE_GUIDE.side.steps) expect(within(guide).getByText(step)).toBeTruthy();
    expect(within(guide).getByText("Take Side Photo")).toBeTruthy();
    expect(within(guide).getByText("Choose from Library")).toBeTruthy();
    expect(screen.getByTestId("pose-camera-input").getAttribute("capture")).toBe("environment");

    const file = new File(["x"], "side.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("pose-library-input"), { target: { files: [file] } });
    await waitFor(() => expect(onAddPhoto).toHaveBeenCalledTimes(1));
    const [uid, dataUrl, caption, dateKey, pose] = onAddPhoto.mock.calls[0];
    expect([uid, dataUrl, caption, pose]).toEqual(["c1", "data:image/jpeg;base64,AAA", "", "side"]);
    expect(dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Moves on to the first pose not done yet: Front.
    expect(within(screen.getByTestId("pose-guide")).getByRole("heading", { name: "Front" })).toBeTruthy();
  });

  it("first vs latest per pose, days and kg from the client's own weigh-ins", () => {
    const photos = [
      { id: "a", url: "u/a", date: D(9, 1), pose: "front" },
      { id: "b", url: "u/b", date: D(11, 24), pose: "front" },
      { id: "c", url: "u/c", date: D(10, 1), pose: "back" },
    ];
    expect(firstAndLatest(photos, "front")).toMatchObject({ first: { id: "a" }, latest: { id: "b" }, count: 2 });
    expect(firstAndLatest(photos, "side")).toBeNull();
    renderProgress(photos, vi.fn(), [
      { id: "w1", date: D(9, 1), weight: 75.4 },
      { id: "w2", date: D(11, 24), weight: 72 },
    ]);
    const figs = screen.getByTestId("pose-figures").textContent;
    expect(figs).toContain("84DAYS");
    expect(figs).toContain("−3.4KG");
    expect(screen.getByRole("button", { name: "First 1 Sept 2026" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Latest 24 Nov 2026" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("group", { name: "Progress pose" })).getByText("Side"));
    expect(screen.getByText("No Side photo yet. Add one to start.")).toBeTruthy();
  });

  it("Train Solo's section (no poses) is unchanged", () => {
    render(<PhotosSection photos={[]} onAdd={() => {}} onDelete={() => {}} busy={false} weighIns={[]} />);
    expect(screen.queryByTestId("pose-tiles")).toBeNull();
    expect(screen.getByText("Add photo")).toBeTruthy();
  });
});
