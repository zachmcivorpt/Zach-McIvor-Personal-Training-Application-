// @vitest-environment jsdom
// #233 (owner): on Coaching's log-in screen the Back link sits lower, clear
// of the iPhone status bar (pt-safe replaces the page's top padding there).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LoginScreen from "./LoginScreen";

vi.mock("../lib/AppContext", () => ({
  useApp: () => ({ db: { appDesign: {} }, currentUser: null, hasCoach: true, login: vi.fn(), logout: vi.fn() }),
}));
afterEach(cleanup);

describe("Coaching log-in Back link (#233)", () => {
  it("has space above it, below the status bar", () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <LoginScreen />
      </MemoryRouter>
    );
    const back = screen.getByRole("link", { name: /Back/ });
    expect(back.className).toMatch(/\bmt-4\b/);
    expect(back.parentElement.className).toMatch(/pt-safe/);
  });
});
