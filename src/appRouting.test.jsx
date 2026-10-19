// @vitest-environment jsdom
//
// Regression coverage for the Train Solo entry-point routing change. The
// ONLY behavioral change in App.jsx for this feature is RootRedirect's
// unauthenticated branch: was <Navigate to="/login" replace />, now
// <Navigate to="/start" replace />. Everything else — RequireRole, the
// authenticated-coach/authenticated-client branches of RootRedirect, the
// /login, /coach/*, /app/* routes themselves — must be provably unchanged,
// not just "should be fine by inspection." These tests render the real
// Routed() tree (exported from App.jsx solely to make this possible) at
// different starting paths with a mocked useApp(), and assert on which
// screen actually lands — not a code-reading argument, an actual render.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Routed } from "./App";

let mockUseApp;
vi.mock("./lib/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

// Heavy lazy-loaded shells — stubbed so these tests exercise routing
// decisions only, not CoachShell/ClientApp/SoloRoutes' own huge trees
// (each independently tested elsewhere).
vi.mock("./coach/CoachShell", () => ({ default: () => <div>COACH_SHELL</div> }));
vi.mock("./client/ClientApp", () => ({ default: () => <div>CLIENT_APP</div> }));
vi.mock("./solo/SoloRoutes", () => ({ default: () => <div>SOLO_ROUTES</div> }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routed />
    </MemoryRouter>
  );
}

// LoginScreen reads db.appDesign — minimal stand-in, same shape AppContext
// provides pre-auth.
const baseAppState = { db: { appDesign: {} } };

describe("App routing — unauthenticated visitors", () => {
  it("/ redirects a signed-out visitor to /start (the new entry point, not /login)", async () => {
    mockUseApp = () => ({ ...baseAppState, currentUser: null, sessionLoading: false });
    renderAt("/");
    expect(await screen.findByText("Coaching")).toBeTruthy();
    expect(screen.getByText("Train Solo")).toBeTruthy();
  });

  it("an unknown path also redirects a signed-out visitor to /start", async () => {
    mockUseApp = () => ({ ...baseAppState, currentUser: null, sessionLoading: false });
    renderAt("/some/unknown/path");
    expect(await screen.findByText("Coaching")).toBeTruthy();
  });

  it("/login is still directly reachable and unchanged — StartScreen does not intercept it", async () => {
    mockUseApp = () => ({ ...baseAppState, currentUser: null, sessionLoading: false, hasCoach: true });
    renderAt("/login");
    expect(await screen.findByPlaceholderText("you@example.com")).toBeTruthy();
  });

  it("while session is still loading, shows the loading splash — not /start, not /login", async () => {
    mockUseApp = () => ({ ...baseAppState, currentUser: null, sessionLoading: true });
    const { container } = renderAt("/");
    expect(screen.queryByText("Train Solo")).toBeNull();
    expect(container.querySelector("img, svg")).toBeTruthy();
  });
});

describe("App routing — authenticated Coaching users are completely unaffected", () => {
  it("an authenticated coach visiting / still lands on the coach console, not /start", async () => {
    mockUseApp = () => ({ ...baseAppState, currentUser: { role: "coach" }, sessionLoading: false });
    renderAt("/");
    expect(await screen.findByText("COACH_SHELL")).toBeTruthy();
    expect(screen.queryByText("Train Solo")).toBeNull();
  });

  it("an authenticated client visiting / still lands on the client app, not /start", async () => {
    mockUseApp = () => ({ ...baseAppState, currentUser: { role: "client" }, sessionLoading: false });
    renderAt("/");
    expect(await screen.findByText("CLIENT_APP")).toBeTruthy();
    expect(screen.queryByText("Train Solo")).toBeNull();
  });

  it("an authenticated coach hitting /app (the wrong role's route) is bounced to /coach, same as before", async () => {
    mockUseApp = () => ({ ...baseAppState, currentUser: { role: "coach" }, sessionLoading: false });
    renderAt("/app");
    expect(await screen.findByText("COACH_SHELL")).toBeTruthy();
  });

  it("a signed-out visitor hitting /coach directly still redirects to /login, not /start", async () => {
    mockUseApp = () => ({ ...baseAppState, currentUser: null, sessionLoading: false, hasCoach: true });
    renderAt("/coach");
    expect(await screen.findByPlaceholderText("you@example.com")).toBeTruthy();
  });
});

describe("App routing — Train Solo routes are reachable and isolated", () => {
  it("/solo/* renders the Train Solo route tree regardless of Coaching auth state", async () => {
    mockUseApp = () => ({ ...baseAppState, currentUser: null, sessionLoading: false });
    renderAt("/solo/register");
    expect(await screen.findByText("SOLO_ROUTES")).toBeTruthy();
  });
});
