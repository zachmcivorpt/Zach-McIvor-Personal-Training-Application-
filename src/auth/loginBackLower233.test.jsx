// @vitest-environment jsdom
// #233: Coaching's log-in Back sat right under the iPhone clock (top padding
// was only the safe-area inset). It now has Train Solo's top space.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ({ db: { appDesign: {} }, currentUser: null, hasCoach: true }) }));
import LoginScreen from "./LoginScreen";
afterEach(cleanup);

describe("Coaching log-in top space (#233)", () => {
  it("Back sits 2rem below the safe area, like Train Solo's log-in", () => {
    render(<MemoryRouter><LoginScreen /></MemoryRouter>);
    const frame = screen.getByTestId("coaching-login-frame");
    expect(frame.getAttribute("style")).toMatch(/padding-top:\s*calc\(2rem \+ env\(safe-area-inset-top/);
    expect(frame.className).not.toMatch(/\bpt-safe\b/);
    expect(frame.firstElementChild.textContent).toMatch(/Back/);
  });
});
