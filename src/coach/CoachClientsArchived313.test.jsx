// @vitest-environment jsdom
// #313: Clients → Archived lists archived clients with Restore and a
// Delete now that needs the full name typed (#315). Renders the REAL CoachClients.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  it("Delete now needs the full name typed (#315)", async () => {
    render(<CoachClients showToast={() => {}} search="" setSearch={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete now" }));
    const del = screen.getByRole("button", { name: /Delete for good/ });
    fireEvent.click(del);
    expect(app.deleteClientNow).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "Rusir" } });
    fireEvent.click(del);
    expect(app.deleteClientNow).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "rusiru" } });
    await act(async () => fireEvent.click(del));
    expect(app.deleteClientNow).toHaveBeenCalledWith("r1", "rusiru");
  });
});
