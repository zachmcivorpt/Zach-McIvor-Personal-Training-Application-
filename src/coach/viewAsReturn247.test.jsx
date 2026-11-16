// @vitest-environment jsdom
//
// #247: leaving View as Client goes straight back to the client page (and
// tab) the coach started from, not a fresh Overview; the client app's code
// is preloaded while the console is idle.
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({ ret: null, cleared: false }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../lib/push", () => ({ disablePush: vi.fn() }));
// Real-shaped db (#167): per-client lists are grouped by client id.
vi.mock("../lib/AppContext", () => ({
  peekViewAsReturn: (uid) => (uid === "coach" ? state.ret : null),
  clearViewAsReturn: () => { state.cleared = true; },
  useApp: () => ({
    currentUser: { id: "coach", name: "Zach McIvor", role: "coach" },
    logout: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    db: {
      users: [{ id: "c1", role: "client", status: "active", name: "Sarah Mitchell", coachMessagesSeenAt: 0 }],
      messages: { c1: [{ id: "m1", clientId: "c1", from: "client", text: "hi", date: 5 }] },
      notifications: [],
    },
  }),
}));
vi.doMock("./CoachClients", () => ({
  default: ({ openClientId, openClientAction }) => <div>Clients screen {openClientId || "none"} {openClientAction?.tab || "-"}</div>,
}));
for (const [file, name] of [
  ["./CoachDashboard", "Overview screen"],
  ["./CoachLibrary", "Library screen"],
  ["./CoachMessages", "Messages screen"],
  ["./CoachChallenges", "Challenges screen"],
  ["./CoachGroups", "Groups screen"],
  ["./CoachMore", "Settings screen"],
  ["./CoachTrainSolo", "Train Solo screen"],
]) {
  vi.doMock(file, () => ({ default: () => <div>{name}</div> }));
}

afterEach(() => {
  cleanup();
  state.ret = null;
  state.cleared = false;
});

describe("back from View as Client (#247)", () => {
  it("opens the client page and tab the coach left from, then forgets it", async () => {
    state.ret = { coachUid: "coach", clientId: "c1", clientTab: "calendar" };
    const { default: CoachShell } = await import("./CoachShell");
    render(<CoachShell />);
    expect(screen.getByText("Clients screen c1 calendar")).toBeTruthy();
    expect(screen.queryByText("Overview screen")).toBeNull();
    expect(state.cleared).toBe(true);
  });
  it("from the client list: back to the list", async () => {
    state.ret = { coachUid: "coach", tab: "clients" };
    const { default: CoachShell } = await import("./CoachShell");
    render(<CoachShell />);
    expect(screen.getByText("Clients screen none -")).toBeTruthy();
  });
  it("a normal open still starts on Overview", async () => {
    const { default: CoachShell } = await import("./CoachShell");
    render(<CoachShell />);
    expect(screen.getByText("Overview screen")).toBeTruthy();
  });
  it("View as Client remembers where it started; the console preloads the client app", () => {
    const detail = fs.readFileSync("src/coach/CoachClientDetail.jsx", "utf8");
    expect((detail.match(/startViewAsClient\(client\.id, null, \{ clientId: client\.id, clientTab \}\)/g) || []).length).toBe(2);
    const shell = fs.readFileSync("src/coach/CoachShell.jsx", "utf8");
    expect(shell).toMatch(/import\("\.\.\/client\/ClientApp"\)/);
  });
});
