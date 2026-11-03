// The message box used by every chat (coach ↔ client threads and group
// chats). It grows with what's typed, up to about six lines, then scrolls,
// so the whole message stays readable while writing — a one-line <input>
// scrolled the start of a long message out of view. On a phone, Return
// starts a new line (paragraphs) and only the send button sends; with a
// real keyboard (desktop), Enter sends and Shift+Enter adds a line.
// REGRESSION_TESTS.md #127.
import React, { useLayoutEffect, useRef } from "react";

const MAX_HEIGHT = 140; // ≈ 6 lines of text-sm

function touchDevice() {
  try {
    return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;
  } catch {
    return false;
  }
}

export function MessageComposerInput({ value, onChange, onSend, placeholder, className = "", style, inputRef }) {
  const ref = useRef(null);
  const el = inputRef || ref;

  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    node.style.height = "auto";
    const next = Math.min(node.scrollHeight, MAX_HEIGHT);
    node.style.height = `${next}px`;
    node.style.overflowY = node.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  }, [value, el]);

  return (
    <textarea
      ref={el}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Enter" || e.shiftKey || e.nativeEvent?.isComposing) return;
        if (touchDevice()) return; // phone: Return = new line
        e.preventDefault();
        onSend?.();
      }}
      placeholder={placeholder}
      enterKeyHint="enter"
      className={`resize-none leading-5 ${className}`}
      style={{ maxHeight: MAX_HEIGHT, ...style }}
    />
  );
}
