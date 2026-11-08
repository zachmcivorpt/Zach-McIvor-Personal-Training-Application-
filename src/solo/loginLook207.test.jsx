// @vitest-environment jsdom
// #207: first page before the chooser; Back on every log-in screen returns
// to the chooser (Coaching's /login had no Back at all).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import StartScreen from "./StartScreen";
import LoginScreen from "../auth/LoginScreen";
import SoloLoginScreen from "./SoloLoginScreen";

vi.mock("./useSoloLoginBackground", () => ({ useSoloLoginBackground: () => ({}) }));
vi.mock("../lib/AppContext", () => ({
  useApp: () => ({ db: { appDesign: {} }, currentUser: null, hasCoach: true, login: vi.fn(), logout: vi.fn() }),
}));
vi.mock("../lib/SoloAppContext", () => ({
  useSoloApp: () => ({ soloLogin: vi.fn(), soloCurrentUser: null, soloAppDesign: {}, soloProfileMissing: false }),
}));

afterEach(cleanup);

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
}
function tree(path) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Where />
      <Routes>
        <Route path="/start" element={<StartScreen />} />
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/solo/login" element={<SoloLoginScreen />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("login area (#207)", () => {
  it("/start shows the first page, and its arrow opens the chooser", () => {
    render(tree("/start"));
    expect(screen.getByTestId("glow-logo")).toBeTruthy();
    expect(screen.queryByText("Coaching")).toBeNull();
    fireEvent.click(screen.getByLabelText("Get started"));
    expect(screen.getByTestId("where").textContent).toBe("/start?step=choose");
    expect(screen.getByText("Coaching")).toBeTruthy();
    expect(screen.getByText("Train Solo")).toBeTruthy();
  });

  it("Coaching's log-in has a Back to the chooser and keeps its form", () => {
    render(tree("/login"));
    expect(screen.getByPlaceholderText("you@example.com")).toBeTruthy();
    expect(screen.getByText("Client")).toBeTruthy();
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByTestId("where").textContent).toBe("/start?step=choose");
  });

  it("Train Solo's log-in Back returns to the chooser, not the first page", () => {
    render(tree("/solo/login"));
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByTestId("where").textContent).toBe("/start?step=choose");
    expect(screen.getByText("Coaching")).toBeTruthy();
  });
});
