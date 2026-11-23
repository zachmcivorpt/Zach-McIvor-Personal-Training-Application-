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
    const panel = baseElement.querySelector("[data-testid=client-chat] .overflow-y-auto");
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

  it("#322: a full-screen page — box right at the bottom, sits on the keyboard, the list can't drag past its ends", () => {
    const { baseElement } = render(<MessagesSheet open onClose={() => {}} user={{ id: "c1" }} thread={[msg(1)]} onSend={() => {}} coachName="Coach" />);
    const page = screen.getByTestId("client-chat");
    expect(page.className).toContain("fixed");
    expect(page.style.height).toBe(`${window.innerHeight}px`); // the visible area
    expect(baseElement.querySelector(".rounded-t-3xl")).toBeNull(); // not a sheet
    const list = page.querySelector(".overflow-y-auto");
    expect(list.className).toContain("overscroll-contain");
    const bar = screen.getByTestId("client-chat-bar");
    expect(bar.className).toContain("pb-[max(calc(env(safe-area-inset-bottom)-14px),8px)]");
    const box = screen.getByPlaceholderText("Message your coach...");
    act(() => box.focus());
    expect(screen.getByTestId("client-chat-bar").className).toContain("pb-2");
    expect(screen.getByTestId("client-chat-bar").className).not.toContain("safe-area");
  });

  it("#322: Back closes it; closed renders nothing", () => {
    const onClose = vi.fn();
    const { rerender } = render(<MessagesSheet open onClose={onClose} user={{ id: "c1" }} thread={[msg(1)]} onSend={() => {}} coachName="Coach" />);
    fireEvent.click(screen.getByLabelText("Back"));
    expect(onClose).toHaveBeenCalled();
    rerender(<MessagesSheet open={false} onClose={onClose} user={{ id: "c1" }} thread={[msg(1)]} onSend={() => {}} coachName="Coach" />);
    expect(screen.queryByTestId("client-chat")).toBeNull();
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

describe("#323 client chat: nothing shows through under the keyboard; swipe down closes", () => {
  const props = () => ({ open: true, onClose: vi.fn(), user: { id: "c1" }, thread: [msg(1), msg(2)], onSend() {}, coachName: "Coach" });
  it("the chat's colour runs on under the keyboard (an underlay past the bottom)", () => {
    render(<MessagesSheet {...props()} />);
    const under = screen.getByTestId("client-chat-underlay");
    expect(under.style.bottom).toBe("-100vh");
    expect(under.style.backgroundColor).toBe(screen.getByTestId("client-chat").style.backgroundColor);
  });
  it("dragging down from the header far enough closes; a short drag springs back", () => {
    const p = props();
    render(<MessagesSheet {...p} />);
    const page = screen.getByTestId("client-chat");
    const header = page.querySelector("[data-chat-header]");
    fireEvent.touchStart(header, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(header, { touches: [{ clientY: 150 }] });
    expect(page.style.transform).toBe("translateY(50px)");
    fireEvent.touchEnd(header);
    expect(p.onClose).not.toHaveBeenCalled();
    expect(page.style.transform).toBe("");
    fireEvent.touchStart(header, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(header, { touches: [{ clientY: 260 }] });
    fireEvent.touchEnd(header);
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
  it("never closes from a drag while typing (that drag puts the keyboard away)", () => {
    const p = props();
    render(<MessagesSheet {...p} />);
    const page = screen.getByTestId("client-chat");
    const list = page.querySelector(".overflow-y-auto");
    list.scrollTop = 0;
    act(() => screen.getByPlaceholderText("Message your coach...").focus());
    fireEvent.touchStart(list, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(list, { touches: [{ clientY: 300 }] });
    fireEvent.touchEnd(list);
    expect(p.onClose).not.toHaveBeenCalled();
    expect(document.activeElement?.tagName).not.toBe("TEXTAREA");
  });
  it("from the messages: closes only when they're at the top", () => {
    const p = props();
    render(<MessagesSheet {...p} />);
    const list = screen.getByTestId("client-chat").querySelector(".overflow-y-auto");
    list.scrollTop = 500; // reading older messages further up
    fireEvent.touchStart(list, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(list, { touches: [{ clientY: 300 }] });
    fireEvent.touchEnd(list);
    expect(p.onClose).not.toHaveBeenCalled();
  });
});
