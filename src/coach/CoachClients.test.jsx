// @vitest-environment jsdom
//
// Regression coverage for "clicking a Recent Activity row should open the
// client straight onto the right tab" — specifically, a body-stats
// (weigh-in) row needs to land on Progress, not Summary. CoachDashboard's
// onOpenClient(clientId, { tab }) call has to survive the trip through
// CoachShell -> CoachClients -> CoachClientDetail's initialTab prop.
// This test exercises the CoachClients half of that chain: given an
// openClientId + openClientAction prop pair (what CoachShell now passes
// through from onOpenClient's second argument), does the mounted detail
// view actually receive initialTab="progress"?
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import CoachClients from "./CoachClients";

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../lib/AppContext", () => ({
  useApp: () => ({
    db: {
      users: [{ id: "client-a", role: "client", status: "active", name: "Alice" }],
      messages: {},
      clientPhases: {},
      formResponses: {},
      mealPlans: {},
    },
    removeClient: vi.fn(),
    startViewAsClient: vi.fn(),
    setClientAccessPaused: vi.fn(),
    usersReady: true,
  }),
  getCurrentPhase: () => null,
  getNextPhase: () => null,
  needsNewPhaseSoon: () => false,
}));
// The real CoachClientDetail is a huge component with its own deep data
// needs — stubbed down to just the one prop this test actually cares
// about, matching the pattern other tests in this repo use for heavy
// shared components.
vi.mock("./CoachClientDetail", () => ({
  default: ({ clientId, initialTab }) => (
    <div data-testid="client-detail">
      client={clientId} tab={initialTab || "summary"}
    </div>
  ),
}));

afterEach(() => cleanup());

describe("CoachClients: opening a client on a specific tab from outside this screen", () => {
  it("opens the client detail view on the Progress tab when openClientAction requests it", () => {
    render(
      <CoachClients
        showToast={() => {}}
        search=""
        setSearch={() => {}}
        openClientId="client-a"
        openClientAction={{ tab: "progress" }}
        onOpenClientHandled={() => {}}
      />
    );

    expect(screen.getByTestId("client-detail").textContent).toBe("client=client-a tab=progress");
  });

  it("defaults to Summary when no action is given", () => {
    render(
      <CoachClients
        showToast={() => {}}
        search=""
        setSearch={() => {}}
        openClientId="client-a"
        openClientAction={null}
        onOpenClientHandled={() => {}}
      />
    );

    expect(screen.getByTestId("client-detail").textContent).toBe("client=client-a tab=summary");
  });
});
