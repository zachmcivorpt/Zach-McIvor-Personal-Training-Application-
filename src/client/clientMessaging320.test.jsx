// @vitest-environment jsdom
// #320 (owner, 2026-11-23): the client's chat with their coach on the iPhone
// — videos painted over the sheet's header, thick frames round videos, and
// the same keyboard / paragraph pains as the coach side (#319). Renders the
// REAL MessagesSheet and BottomSheet.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ({ db: {}, reactToMessage: vi.fn() }) }));
import { MessagesSheet } from "./ClientApp";

const user = { id: "c1", name: "Zach McIvor" };
const thread = [
  { id: "m1", clientId: "c1", from: "client", date: Date.now() - 60000, text: "", attachment: { type: "video", url: "https://x/v.mp4" } },
  { id: "m2", clientId: "c1", from: "coach", date: Date.now() - 30000, text: "Nicely done", attachment: { type: "video", url: "https://x/w.mp4" } },
];
function setup() {
  const onSend = vi.fn();
  const r = render(<MessagesSheet open onClose={() => {}} user={user} thread={thread} onSend={onSend} coachName="Zachary McIvor" />);
  return { ...r, onSend };
}
afterEach(cleanup);

describe("client chat on the iPhone (#320)", () => {
  it("the sheet's header sits above scrolled videos (own layer, z-10)", () => {
    setup();
    const header = screen.getByTestId("sheet-header");
    expect(header.className).toContain("z-10");
    expect(header.style.transform).toBe("translateZ(0)");
  });

  it("a video on its own has a thin frame; with text it keeps the bubble", () => {
    const { baseElement } = setup();
    const videos = baseElement.querySelectorAll("video");
    expect(videos[0].className).not.toContain("mt-2");
    expect(videos[0].parentElement.className).toContain("p-1");
    expect(videos[1].className).toContain("mt-2");
  });

  it("Send keeps the keyboard up; paragraphs get 220px; dragging down puts the keyboard away", () => {
    const { baseElement, onSend } = setup();
    const box = screen.getByPlaceholderText("Message your coach...");
    expect(box.style.maxHeight).toBe("220px");
    box.focus();
    fireEvent.change(box, { target: { value: "Para one\n\nPara two" } });
    const send = screen.getByLabelText("Send");
    expect(fireEvent.pointerDown(send)).toBe(false);
    fireEvent.click(send);
    expect(onSend).toHaveBeenCalledWith("Para one\n\nPara two");
    box.focus();
    const list = baseElement.querySelector("video").closest("[style]").parentElement.closest(".pb-3");
    fireEvent.touchStart(list, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(list, { touches: [{ clientY: 150 }] });
    expect(document.activeElement).not.toBe(box);
  });
});
