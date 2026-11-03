// @vitest-environment jsdom
//
// #127 (owner report, coach Messages on iPhone): the bottom tabs stayed
// between the message box and the keyboard, a long message scrolled out of
// sight in a one-line box, and Return sent the message so there was no way
// to start a new paragraph.
import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MessageComposerInput } from "./MessageComposerInput";
import { isTextEntry, useTextEntryFocused } from "../lib/textEntryFocus";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete window.matchMedia;
});

function pointer(coarse) {
  window.matchMedia = vi.fn((q) => ({ matches: coarse && q.includes("coarse"), media: q, addEventListener() {}, removeEventListener() {} }));
}

function Composer({ onSend }) {
  const [value, setValue] = useState("");
  return <MessageComposerInput value={value} onChange={setValue} onSend={() => onSend(value)} placeholder="Message" />;
}

describe("message box (#127)", () => {
  it("is a multi-line box, not a one-line input", () => {
    render(<Composer onSend={() => {}} />);
    expect(screen.getByPlaceholderText("Message").tagName).toBe("TEXTAREA");
  });

  it("on a phone, Return starts a new line and never sends", () => {
    pointer(true);
    const onSend = vi.fn();
    render(<Composer onSend={onSend} />);
    const box = screen.getByPlaceholderText("Message");
    fireEvent.change(box, { target: { value: "First paragraph" } });
    const ev = fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
    expect(ev).toBe(true); // default (a new line) not prevented
  });

  it("with a real keyboard, Enter sends and Shift+Enter adds a line", () => {
    pointer(false);
    const onSend = vi.fn();
    render(<Composer onSend={onSend} />);
    const box = screen.getByPlaceholderText("Message");
    fireEvent.change(box, { target: { value: "Line one" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("Line one");
  });
});

describe("typing detection that hides the coach tab bar (#127)", () => {
  function Probe() {
    return <p data-testid="state">{useTextEntryFocused() ? "typing" : "idle"}</p>;
  }

  it("is on while a text field has focus and off after", async () => {
    render(
      <>
        <Probe />
        <textarea aria-label="msg" />
        <button>other</button>
      </>
    );
    expect(screen.getByTestId("state").textContent).toBe("idle");
    await act(async () => screen.getByLabelText("msg").focus());
    expect(screen.getByTestId("state").textContent).toBe("typing");
    await act(async () => {
      screen.getByText("other").focus();
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(screen.getByTestId("state").textContent).toBe("idle");
  });

  it("counts text fields only, not checkboxes, sliders or file pickers", () => {
    const el = (html) => {
      const d = document.createElement("div");
      d.innerHTML = html;
      return d.firstChild;
    };
    expect(isTextEntry(el('<input type="text">'))).toBe(true);
    expect(isTextEntry(el("<input>"))).toBe(true);
    expect(isTextEntry(el("<textarea></textarea>"))).toBe(true);
    expect(isTextEntry(el('<input type="checkbox">'))).toBe(false);
    expect(isTextEntry(el('<input type="range">'))).toBe(false);
    expect(isTextEntry(el('<input type="file">'))).toBe(false);
    expect(isTextEntry(el("<button></button>"))).toBe(false);
  });
});
