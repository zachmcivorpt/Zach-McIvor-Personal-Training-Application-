// @vitest-environment jsdom
// #321 (owner, 2026-11-23): after sending, the chat jumped back up to older
// messages (the client's sheet scrolled the newest ones UNDER the pinned
// message box), plus a gap between the box and the keyboard and too much
// page showing above the client's chat. Renders the REAL MessagesSheet and
// coach ThreadMessages; jsdom has no layout, so scroll sizes are stubbed.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

let coachCtx;
vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => coachCtx || { db: {}, reactToMessage: vi.fn() } }));
vi.mock("../lib/storage", () => ({ uploadMessageVideo: vi.fn(), uploadMessagePdf: vi.fn(), uploadMessageImage: vi.fn(), uploadMessageAudio: vi.fn() }));
import { MessagesSheet } from "./ClientApp";
import { ThreadMessages } from "../coach/CoachMessages";

const msg = (i, from = "coach") => ({ id: `m${i}`, clientId: "c1", from, date: Date.now() - (100 - i) * 60000, text: `Message ${i}` });
let intoView;
beforeEach(() => {
  vi.useFakeTimers();
  // A tall list: scrollHeight 2000, a 600px window onto it.
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 2000 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 600 });
  intoView = vi.fn();
  Element.prototype.scrollIntoView = intoView;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete HTMLElement.prototype.scrollHeight;
  delete HTMLElement.prototype.clientHeight;
  coachCtx = undefined;
});

describe("client chat stays on the newest message (#321)", () => {
  it("opens at the bottom, a send keeps the newest message in view, and nothing uses scrollIntoView", () => {
    const thread = [msg(1), msg(2), msg(3)];
    const props = { open: true, onClose() {}, user: { id: "c1", name: "Z" }, onSend: vi.fn(), coachName: "Coach" };
    const { rerender, baseElement } = render(<MessagesSheet {...props} thread={thread} />);
    act(() => vi.advanceTimersByTime(200));
    const panel = baseElement.querySelector(".overflow-y-auto.rounded-t-3xl");
    expect(panel.scrollTop).toBe(2000);
    fireEvent.change(screen.getByPlaceholderText("Message your coach..."), { target: { value: "New one" } });
    panel.scrollTop = 0; // as if the list had jumped up
    fireEvent.click(screen.getByLabelText("Send"));
    expect(panel.scrollTop).toBe(2000);
    rerender(<MessagesSheet {...props} thread={[...thread, msg(4, "client")]} />);
    act(() => vi.advanceTimersByTime(200));
    expect(panel.scrollTop).toBe(2000);
    expect(intoView).not.toHaveBeenCalled();
  });

  it("no home-bar gap above the keyboard, and the sheet takes 94% of the screen", () => {
    const { baseElement } = render(<MessagesSheet open onClose={() => {}} user={{ id: "c1" }} thread={[msg(1)]} onSend={() => {}} coachName="Coach" />);
    const box = screen.getByPlaceholderText("Message your coach...");
    const bar = box.closest(".sticky");
    expect(bar.className).toContain("pb-[max(0.5rem,env(safe-area-inset-bottom))]");
    act(() => box.focus());
    expect(box.closest(".sticky").className).toContain("pb-2");
    expect(box.closest(".sticky").className).not.toContain("safe-area");
    const panel = baseElement.querySelector(".overflow-y-auto.rounded-t-3xl");
    expect(panel.style.maxHeight).toBe(`${Math.round(window.innerHeight * 0.94)}px`);
  });
});

describe("coach chat stays on the newest message (#321)", () => {
  function setup(thread) {
    coachCtx = { db: { messages: { c1: thread } }, sendMessage: vi.fn(), updateUser: vi.fn(), reactToMessage: vi.fn() };
    return render(<ThreadMessages client={{ id: "c1", name: "Kate Rose" }} aboveTabBar />);
  }
  it("a new message while reading older ones doesn't yank the list; Send brings it to the bottom", () => {
    const thread = [msg(1, "client"), msg(2, "client")];
    const { container, rerender } = setup(thread);
    act(() => vi.advanceTimersByTime(200));
    const list = container.querySelector(".overflow-y-auto");
    expect(list.scrollTop).toBe(2000);
    list.scrollTop = 300; // reading older messages
    fireEvent.scroll(list);
    coachCtx = { ...coachCtx, db: { messages: { c1: [...thread, msg(3, "client")] } } };
    rerender(<ThreadMessages client={{ id: "c1", name: "Kate Rose" }} aboveTabBar />);
    act(() => vi.advanceTimersByTime(200));
    expect(list.scrollTop).toBe(300);
    fireEvent.change(screen.getByPlaceholderText("Message Kate..."), { target: { value: "Reply" } });
    fireEvent.click(screen.getByLabelText("Send"));
    expect(list.scrollTop).toBe(2000);
    expect(intoView).not.toHaveBeenCalled();
  });
});
