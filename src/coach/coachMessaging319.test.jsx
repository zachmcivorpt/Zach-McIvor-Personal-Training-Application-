// @vitest-environment jsdom
// #319 (owner, 2026-11-23): coach Messages on the iPhone — a big gap under
// the message box, the keyboard dropping after every Send, hard to write a
// paragraph, and a thick frame around videos. Renders the REAL ThreadMessages
// with db grouped by client (#167).
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

let ctx;
vi.mock("../lib/AppContext", () => ({ useApp: () => ctx }));
vi.mock("../lib/storage", () => ({ uploadMessageVideo: vi.fn(), uploadMessagePdf: vi.fn(), uploadMessageImage: vi.fn(), uploadMessageAudio: vi.fn() }));
import { ThreadMessages, isMediaOnly } from "./CoachMessages";

const client = { id: "c1", name: "Kate Rose", role: "client", status: "active" };
function setup(props = {}) {
  ctx = {
    db: {
      messages: {
        c1: [
          { id: "m1", clientId: "c1", from: "client", date: Date.now() - 60000, text: "", attachment: { type: "video", url: "https://x/v.mp4" } },
          { id: "m2", clientId: "c1", from: "client", date: Date.now() - 30000, text: "Here's my squat", attachment: { type: "video", url: "https://x/w.mp4" } },
        ],
      },
    },
    sendMessage: vi.fn(),
    updateUser: vi.fn(),
    reactToMessage: vi.fn(),
  };
  return render(<ThreadMessages client={client} {...props} />);
}
afterEach(cleanup);

describe("coach Messages on the iPhone (#319)", () => {
  it("Send keeps the message box focused, so the keyboard stays up", () => {
    setup({ aboveTabBar: true });
    const box = screen.getByPlaceholderText("Message Kate...");
    box.focus();
    fireEvent.change(box, { target: { value: "Line one\nLine two" } });
    const send = screen.getByLabelText("Send");
    // pointerdown/mousedown on Send must not take focus from the box.
    expect(fireEvent.pointerDown(send)).toBe(false);
    expect(fireEvent.mouseDown(send)).toBe(false);
    fireEvent.click(send);
    expect(ctx.sendMessage).toHaveBeenCalledWith("c1", "coach", "Line one\nLine two", undefined, undefined);
  });

  it("dragging the messages down puts the keyboard away", () => {
    const { container } = setup();
    const box = screen.getByPlaceholderText("Message Kate...");
    box.focus();
    expect(document.activeElement).toBe(box);
    const list = container.querySelector(".overflow-y-auto");
    fireEvent.touchStart(list, { touches: [{ clientY: 200 }] });
    fireEvent.touchMove(list, { touches: [{ clientY: 210 }] }); // small move: keep typing
    expect(document.activeElement).toBe(box);
    fireEvent.touchMove(list, { touches: [{ clientY: 240 }] });
    expect(document.activeElement).not.toBe(box);
  });

  it("paragraphs get room: the box grows to 220px before scrolling", () => {
    setup();
    expect(screen.getByPlaceholderText("Message Kate...").style.maxHeight).toBe("220px");
  });

  it("a video on its own sits in a thin frame; with text it keeps the bubble", () => {
    const { container } = setup();
    const videos = container.querySelectorAll("video");
    expect(videos[0].className).not.toContain("mt-2");
    expect(videos[0].parentElement.className).toContain("p-1");
    expect(videos[1].className).toContain("mt-2");
    expect(videos[1].parentElement.className).toContain("px-3.5");
    expect(isMediaOnly({ attachment: { type: "image" }, text: "" })).toBe(true);
    expect(isMediaOnly({ attachment: { type: "video", formCheck: {} }, text: "" })).toBe(false);
  });

  it("on the Messages tab the composer doesn't add the home-bar space again", () => {
    const tab = setup({ aboveTabBar: true }).container.innerHTML;
    expect(tab).not.toContain("safe-area-inset-bottom");
    cleanup();
    const full = setup().container.innerHTML; // full-screen thread: home bar less 14px (#322)
    expect(full).toContain("pb-[max(calc(env(safe-area-inset-bottom)-14px),8px)]");
    const src = fs.readFileSync(path.join(__dirname, "CoachMessages.jsx"), "utf8");
    expect(src).toContain('pb-[calc(53px+max(calc(env(safe-area-inset-bottom)-14px),4px))]');
    expect(src).not.toContain('"pb-[calc(4rem+env(safe-area-inset-bottom))]"');
  });
});
