// @vitest-environment jsdom
//
// #189 Coach console on iPhone, iPad and Mac: every tab opens at its top,
// iPad (md–xl) gets the icon rail with labels, the shell uses the visible
// screen height (dvh) and keeps clear of the safe areas, and the tab fade
// never traps the full-screen overlays (no transform, no fill-mode).
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../lib/push", () => ({ disablePush: vi.fn() }));
// Real-shaped db (#167): per-client lists are grouped by client id.
vi.mock("../lib/AppContext", () => ({
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
for (const [file, name] of [
  ["./CoachDashboard", "Overview screen"],
  ["./CoachClients", "Clients screen"],
  ["./CoachLibrary", "Library screen"],
  ["./CoachMessages", "Messages screen"],
  ["./CoachChallenges", "Challenges screen"],
  ["./CoachGroups", "Groups screen"],
  ["./CoachMore", "Settings screen"],
  ["./CoachTrainSolo", "Train Solo screen"],
]) {
  vi.doMock(file, () => ({ default: () => <div>{name}</div> }));
}

afterEach(() => cleanup());

async function renderShell() {
  const { default: CoachShell } = await import("./CoachShell");
  return render(<CoachShell />);
}

describe("Coach console on every Apple device (#189)", () => {
  it("opens each tab at its top, not where the last tab was scrolled to", async () => {
    await renderShell();
    const main = screen.getByText("Overview screen").closest(".overflow-y-auto");
    main.scrollTop = 900;
    fireEvent.click(screen.getAllByRole("button", { name: "Clients" })[0]);
    expect(screen.getByText("Clients screen")).toBeTruthy();
    expect(main.scrollTop).toBe(0);
  });

  it("shows the icon rail on iPad widths and the full sidebar from xl", async () => {
    const { container } = await renderShell();
    const sidebar = container.querySelector(".coach-shell > div");
    expect(sidebar.className).toContain("md:flex");
    expect(sidebar.className).toContain("w-20");
    expect(sidebar.className).toContain("xl:w-64");
    // Each rail button still names its tab (label under the icon).
    const messages = screen.getAllByRole("button", { name: "Messages" })[0];
    expect(messages.textContent).toContain("Messages");
    expect(messages.className).toContain("xl:flex-row");
  });

  it("fills the visible screen and keeps clear of the notch and home bar", async () => {
    const { container } = await renderShell();
    const shell = container.querySelector(".coach-shell");
    expect(shell.className).toContain("coach-full-height");
    expect(shell.className).not.toContain("h-screen");
    const main = screen.getByText("Overview screen").closest(".overflow-y-auto");
    expect(main.className).toContain("env(safe-area-inset-top)");
    expect(main.className).toContain("env(safe-area-inset-bottom)");
    const css = fs.readFileSync(path.resolve(__dirname, "../index.css"), "utf8");
    expect(css).toMatch(/\.coach-full-height\s*{\s*height: 100vh;\s*height: 100dvh;/);
  });

  it("fades tabs in with opacity only, so overlays inside a tab stay full-screen", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../index.css"), "utf8");
    const keyframes = css.slice(css.indexOf("@keyframes coach-tab-in"), css.indexOf(".coach-tab-in {"));
    expect(keyframes).not.toMatch(/transform/);
    expect(css).toMatch(/\.coach-tab-in\s*{\s*animation: coach-tab-in \d+ms ease-out;\s*}/);
  });
});
