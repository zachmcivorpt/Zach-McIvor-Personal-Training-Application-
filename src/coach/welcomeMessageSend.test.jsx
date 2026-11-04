// @vitest-environment jsdom
// #162: a client got the welcome message days after they'd started chatting
// — the coach's "Send welcome message now" link sent it on a single tap (a
// stray tap while scrolling the client's page). It now asks first and says
// if they already got it.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

let ctx;
vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ctx }));

import { QuickSendActions } from "./CoachClientDetail";

const client = { id: "u1", name: "Rusiru H", status: "active", email: "r@example.invalid" };
const welcomeMessage = { text: "Hi {name},\n\nWelcome to the app!", autoSend: true };
// db.messages exactly as AppContext builds it: grouped by client
// ({ [clientId]: [...] }), never a flat list (#167 — the #162 version of
// this test used a flat list, which hid a crash on every client's page).
function grouped(list) {
  const out = {};
  for (const m of list) (out[m.clientId] = out[m.clientId] || []).push(m);
  return out;
}
function setup(messages = []) {
  ctx = { db: { welcomeMessage, messages: grouped(messages) }, sendMessage: vi.fn(), sendPasswordReset: vi.fn() };
  const showToast = vi.fn();
  render(<QuickSendActions client={client} showToast={showToast} onSendLogin={() => {}} />);
  return showToast;
}
afterEach(cleanup);

describe("Send welcome message now (#162)", () => {
  it("one tap doesn't send — it asks first", () => {
    setup();
    fireEvent.click(screen.getByText("Send welcome message now"));
    expect(ctx.sendMessage).not.toHaveBeenCalled();
    expect(screen.getByText("Send the welcome message?")).toBeTruthy();
  });
  it("Send sends it once, tagged as the welcome", () => {
    const toast = setup();
    fireEvent.click(screen.getByText("Send welcome message now"));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(ctx.sendMessage).toHaveBeenCalledTimes(1);
    expect(ctx.sendMessage).toHaveBeenCalledWith("u1", "coach", "Hi Rusiru,\n\nWelcome to the app!", undefined, { kind: "welcome" });
    expect(toast).toHaveBeenCalledWith("Welcome message sent");
  });
  it("Cancel sends nothing", () => {
    setup();
    fireEvent.click(screen.getByText("Send welcome message now"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(ctx.sendMessage).not.toHaveBeenCalled();
  });
  it("says when they already got it (tagged, or the same text from before the tag)", () => {
    setup([{ id: "m1", clientId: "u1", from: "coach", text: "Hi Rusiru,\n\nWelcome to the app!", date: new Date("2026-11-04T02:03:00Z").getTime() }]);
    fireEvent.click(screen.getByText("Send welcome message now"));
    expect(screen.getByTestId("welcome-confirm-note").textContent).toMatch(/^Rusiru already got it on 4 Nov 2026\. Send it again\?$/);
    expect(screen.getByRole("button", { name: "Send again" })).toBeTruthy();
  });
});

describe("the client's page in the coach console (#167)", () => {
  it("opens with the real message data (grouped by client), other clients' threads included", () => {
    setup([
      { id: "m0", clientId: "someone-else", from: "coach", kind: "welcome", text: "Hi", date: 1 },
      { id: "m1", clientId: "u1", from: "client", text: "hello", date: 2 },
    ]);
    expect(screen.getByText("Send welcome message now")).toBeTruthy();
    fireEvent.click(screen.getByText("Send welcome message now"));
    // Another client's welcome doesn't count as this client's.
    expect(screen.queryByTestId("welcome-confirm-note")?.textContent || "").not.toMatch(/already got it/);
  });
  it("opens with no messages loaded at all", () => {
    ctx = { db: { welcomeMessage }, sendMessage: vi.fn(), sendPasswordReset: vi.fn() };
    render(<QuickSendActions client={client} showToast={vi.fn()} onSendLogin={() => {}} />);
    expect(screen.getByText("Send welcome message now")).toBeTruthy();
  });
});
