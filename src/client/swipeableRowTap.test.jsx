// @vitest-environment jsdom
//
// A plain tap on a button inside a SwipeableRow (a logged food to edit it,
// a saved meal's +) didn't reach the button in a real browser: the row
// captured the pointer on pointerdown, and with the pointer captured the
// browser delivers the tap's click to the capturing row instead of the
// button under the finger. It now captures only once a clear sideways
// drag starts, and swallows the click that ends a swipe.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SwipeableRow } from "./ClientApp";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup() {
  const onTap = vi.fn();
  const onDelete = vi.fn(() => Promise.resolve());
  const capture = vi.fn();
  Element.prototype.setPointerCapture = capture;
  Element.prototype.releasePointerCapture = vi.fn();
  render(
    <SwipeableRow onDelete={onDelete}>
      <button onClick={onTap}>Chicken Breast</button>
    </SwipeableRow>
  );
  const button = screen.getByText("Chicken Breast");
  return { onTap, onDelete, capture, button, row: button.parentElement };
}

describe("SwipeableRow taps", () => {
  it("a tap doesn't capture the pointer, so the click reaches the button inside", () => {
    const { onTap, capture, button } = setup();
    fireEvent.pointerDown(button, { clientX: 100, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(button, { clientX: 100, clientY: 20, pointerId: 1 });
    fireEvent.click(button);
    expect(capture).not.toHaveBeenCalled();
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("a small wobble or a vertical scroll is still not a swipe", () => {
    const { capture, button } = setup();
    fireEvent.pointerDown(button, { clientX: 100, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(button, { clientX: 96, clientY: 22, pointerId: 1 });
    fireEvent.pointerMove(button, { clientX: 95, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(button, { clientX: 95, clientY: 80, pointerId: 1 });
    expect(capture).not.toHaveBeenCalled();
  });

  it("a sideways drag captures the pointer and the click that ends it doesn't count as a tap", () => {
    vi.useFakeTimers();
    const { onTap, capture, button, row } = setup();
    fireEvent.pointerDown(row, { clientX: 300, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(row, { clientX: 250, clientY: 22, pointerId: 1 });
    fireEvent.pointerMove(row, { clientX: 40, clientY: 22, pointerId: 1 });
    fireEvent.pointerUp(row, { clientX: 40, clientY: 22, pointerId: 1 });
    fireEvent.click(button);
    expect(capture).toHaveBeenCalled();
    expect(onTap).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
