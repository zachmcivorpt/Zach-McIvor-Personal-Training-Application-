// @vitest-environment jsdom
//
// #130: emoji reactions on chat messages. Press and hold (or right-click)
// a message to pick one; the same one again removes it; reactions show on
// the bubble.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChatBubble, NO_TEXT_SELECT } from "./Chat";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function bubble(props) {
  const onReact = vi.fn();
  render(
    <ChatBubble mine={false} first last dark time="5:02 pm" onReact={onReact} {...props}>
      <p>Great session today</p>
    </ChatBubble>
  );
  return onReact;
}

describe("message reactions (#130)", () => {
  it("press and hold opens the emoji picker; picking one reacts", () => {
    vi.useFakeTimers();
    const onReact = bubble({});
    const msg = screen.getByText("Great session today").parentElement;
    fireEvent.pointerDown(msg, { clientX: 10, clientY: 10 });
    expect(screen.queryByRole("menu")).toBe(null);
    act(() => vi.advanceTimersByTime(500));
    fireEvent.click(screen.getByRole("menuitem", { name: "React 🔥" }));
    expect(onReact).toHaveBeenCalledWith("🔥");
    expect(screen.queryByRole("menu")).toBe(null);
  });

  it("a quick tap or a scroll doesn't open it", () => {
    vi.useFakeTimers();
    bubble({});
    const msg = screen.getByText("Great session today").parentElement;
    fireEvent.pointerDown(msg, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(msg);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole("menu")).toBe(null);
    fireEvent.pointerDown(msg, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(msg, { clientX: 10, clientY: 60 });
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole("menu")).toBe(null);
  });

  it("right-click opens it; choosing your current reaction removes it", () => {
    const onReact = bubble({ myReaction: "👍", reactions: { coach: "👍" } });
    fireEvent.contextMenu(screen.getByText("Great session today").parentElement);
    fireEvent.click(screen.getByRole("menuitem", { name: "React 👍" }));
    expect(onReact).toHaveBeenCalledWith(null);
  });

  it("shows both sides' reactions on the bubble", () => {
    bubble({ reactions: { coach: "💪", client: "❤️" } });
    expect(screen.getByRole("button", { name: /Reactions/ }).textContent).toContain("💪");
    expect(screen.getByRole("button", { name: /Reactions/ }).textContent).toContain("❤️");
  });

  it("without onReact (e.g. the welcome message) there's no picker", () => {
    render(
      <ChatBubble mine={false} first last dark>
        <p>Welcome</p>
      </ChatBubble>
    );
    fireEvent.contextMenu(screen.getByText("Welcome").parentElement);
    expect(screen.queryByRole("menu")).toBe(null);
  });

  // #131 (owner, iPhone): holding a message popped up Copy / Look Up /
  // Translate instead of only the reaction bar.
  it("holding a message clears any text selection iPhone started, and the message list opts out of selection", () => {
    vi.useFakeTimers();
    const removeAllRanges = vi.fn();
    vi.spyOn(window, "getSelection").mockReturnValue({ removeAllRanges });
    bubble({});
    const msg = screen.getByText("Great session today").parentElement;
    fireEvent.pointerDown(msg, { clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(500));
    expect(removeAllRanges).toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(NO_TEXT_SELECT).toMatchObject({ WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" });
  });
});
