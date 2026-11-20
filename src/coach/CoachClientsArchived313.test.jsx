// @vitest-environment jsdom
// #313: Clients → Archived lists archived clients with Restore and a
// two-tap Delete now. Renders the REAL CoachClients.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CoachClients from "./CoachClients";

const app = vi.hoisted(() => ({ restoreClient: vi.fn(), deleteClientNow: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../lib/AppContext", () => ({
  useApp: () => ({
    db: {
      users: [{ id: "a", role: "client", status: "active", name: "Alice" }],
      archivedClients: [{ id: "r1", role: "client", name: "Rusiru", email: "r@example.invalid", archivedAt: Date.now() - 2 * 86400000 }],
      messages: {},
      clientPhases: {},
      formResponses: {},
      mealPlans: {},
    },
    removeClient: vi.fn(),
    restoreClient: app.restoreClient,
    deleteClientNow: app.deleteClientNow,
    startViewAsClient: vi.fn(),
    setClientAccessPaused: vi.fn(),
    usersReady: true,
  }),
  getCurrentPhase: () => null,
  getNextPhase: () => null,
  needsNewPhaseSoon: () => false,
}));
vi.mock("./CoachClientDetail", () => ({ default: () => null }));
afterEach(cleanup);

describe("Clients → Archived (#313)", () => {
  it("shows the archived client with days left; Restore restores", () => {
    render(<CoachClients showToast={() => {}} search="" setSearch={() => {}} />);
    const section = screen.getByTestId("archived-clients");
    expect(section.textContent).toContain("Rusiru");
    expect(section.textContent).toContain("28 days left");
    fireEvent.click(screen.getByRole("button", { name: /Restore/ }));
    expect(app.restoreClient).toHaveBeenCalledWith("r1");
  });
  it("Delete now needs a second tap", () => {
    render(<CoachClients showToast={() => {}} search="" setSearch={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete now" }));
    expect(app.deleteClientNow).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tap again to delete" }));
    expect(app.deleteClientNow).toHaveBeenCalledWith("r1");
  });
});
