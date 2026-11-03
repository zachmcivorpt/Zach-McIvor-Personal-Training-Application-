// Whether the user is typing into a text field right now (on a phone that
// means the keyboard is up). The coach console hides its bottom tab bar
// while this is true, so the bar doesn't sit between the message box and
// the keyboard (REGRESSION_TESTS.md #127).
import { useEffect, useState } from "react";

const NOT_TEXT = new Set(["checkbox", "radio", "file", "range", "button", "submit", "reset", "color", "image", "hidden"]);

export function isTextEntry(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") return !NOT_TEXT.has((el.getAttribute("type") || "text").toLowerCase());
  return false;
}

export function useTextEntryFocused() {
  const [focused, setFocused] = useState(() => (typeof document !== "undefined" ? isTextEntry(document.activeElement) : false));
  useEffect(() => {
    const update = () => setFocused(isTextEntry(document.activeElement));
    // focusout fires before the next field gets focus — check after it.
    const onOut = () => setTimeout(update, 0);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", onOut);
    };
  }, []);
  return focused;
}
