import React, { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

// Swipe left to show Delete (#168, Archived programs on My Training). The
// row slides back unless swiped past half the button; tapping Delete asks
// first (onDelete opens the confirm sheet), nothing is ever deleted by the
// swipe itself. iPhone rules from REGRESSION_TESTS.md #107/#109: no pointer
// capture on pointerdown (it steals the tap), capture only once a sideways
// swipe starts (in try/catch), always finish from window-level up/cancel
// events, and decide from the row's real position (dragXRef).
const REVEAL = 88;

export default function SoloSwipeRow({ children, onDelete, label = "Delete", radius = 16 }) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragXRef = useRef(0);
  const start = useRef(null);
  const rowRef = useRef(null);

  const settle = (open) => {
    dragXRef.current = open ? -REVEAL : 0;
    setX(dragXRef.current);
  };

  useEffect(() => {
    function end() {
      const s = start.current;
      if (!s) return;
      start.current = null;
      setDragging(false);
      if (s.swiping) {
        try {
          rowRef.current?.releasePointerCapture?.(s.pointerId);
        } catch {
          /* iOS touch pointers can throw */
        }
        settle(dragXRef.current < -REVEAL / 2);
      }
    }
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, []);

  function onPointerDown(e) {
    start.current = { x0: e.clientX, y0: e.clientY, from: dragXRef.current, pointerId: e.pointerId, swiping: false, decided: false };
  }
  function onPointerMove(e) {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x0;
    const dy = e.clientY - s.y0;
    if (!s.decided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.decided = true;
      s.swiping = Math.abs(dx) > Math.abs(dy);
      if (!s.swiping) return;
      setDragging(true);
      try {
        rowRef.current?.setPointerCapture?.(s.pointerId);
      } catch {
        /* iOS touch pointers can throw */
      }
    }
    if (!s.swiping) return;
    dragXRef.current = Math.max(-REVEAL - 24, Math.min(0, s.from + dx));
    setX(dragXRef.current);
  }
  // A tap on an open row closes it instead of opening the program.
  function onClickCapture(e) {
    if (dragXRef.current !== 0) {
      e.preventDefault();
      e.stopPropagation();
      settle(false);
    }
  }

  return (
    <div className="relative overflow-hidden" style={{ borderRadius: radius }} data-testid="solo-swipe-row">
      <button
        type="button"
        onClick={() => {
          settle(false);
          onDelete();
        }}
        aria-label={label}
        tabIndex={x === 0 ? -1 : 0}
        className="absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-1 text-white text-[11px] font-bold tracking-wide uppercase"
        style={{ width: REVEAL, backgroundColor: "#E5484D", opacity: x === 0 ? 0 : 1 }}
      >
        <Trash2 size={17} />
        {label}
      </button>
      <div
        ref={rowRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onClickCapture={onClickCapture}
        className="relative"
        style={{ transform: `translateX(${x}px)`, transition: dragging ? "none" : "transform 0.22s ease-out", touchAction: "pan-y" }}
      >
        {children}
      </div>
    </div>
  );
}
