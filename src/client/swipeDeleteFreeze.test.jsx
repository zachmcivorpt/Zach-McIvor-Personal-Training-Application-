// @vitest-environment jsdom
//
// Regression coverage for a real production report: swiping a logged food
// to delete it animated the row off-screen, then it "froze" — never
// actually removed, with a blank, stuck row left behind (reported
// alongside a duplicate-entry bug: two "Pea Protein Shake" rows, swiping
// one away left it stuck instead of deleting it).
//
// Two compounding bugs: (1) ClientApp.jsx's `removeFood` never returned
// its own save promise, so a caller had no way to know whether the delete
// actually succeeded; (2) SwipeableRow's own onDelete handler didn't wait
// for anything — it moved the row off-screen and fired onDelete, full
// stop, with nothing to undo that animation if the delete failed. A
// rejected delete (network blip, a denied/failed transaction) left the
// row permanently swiped away while the entry was still sitting right
// there in the data underneath it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SwipeableRow } from "./ClientApp";

afterEach(() => cleanup());

function swipeLeft(row, dx = -250) {
  fireEvent.pointerDown(row, { clientX: 0, pointerId: 1 });
  fireEvent.pointerMove(row, { clientX: dx, pointerId: 1 });
  fireEvent.pointerUp(row, { clientX: dx, pointerId: 1 });
}

describe("SwipeableRow delete failure handling", () => {
  it("snaps the row back into view (instead of leaving it stuck off-screen) when the delete fails", async () => {
    vi.useFakeTimers();
    const onDelete = vi.fn(() => Promise.reject(new Error("offline")));
    render(
      <SwipeableRow onDelete={onDelete}>
        <div>Pea Protein Shake</div>
      </SwipeableRow>
    );
    const row = screen.getByText("Pea Protein Shake").parentElement;

    swipeLeft(row);
    await vi.advanceTimersByTimeAsync(150); // SwipeableRow's own delay before firing onDelete
    await vi.advanceTimersByTimeAsync(0); // let the rejected promise's .catch run

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(row.style.transform).toBe("translateX(0px)");
    vi.useRealTimers();
  });

  it("blocks a second swipe from firing while a delete is still pending", async () => {
    vi.useFakeTimers();
    let resolveDelete;
    const onDelete = vi.fn(() => new Promise((res) => (resolveDelete = res)));
    render(
      <SwipeableRow onDelete={onDelete}>
        <div>Pea Protein Shake</div>
      </SwipeableRow>
    );
    const row = screen.getByText("Pea Protein Shake").parentElement;

    swipeLeft(row);
    await vi.advanceTimersByTimeAsync(150);
    expect(onDelete).toHaveBeenCalledTimes(1);

    swipeLeft(row); // a second, impatient swipe while the first delete is still in flight
    expect(onDelete).toHaveBeenCalledTimes(1); // not called again

    resolveDelete();
    vi.useRealTimers();
  });
});
