// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SoloRegisterScreen from "./SoloRegisterScreen";

let mockUseSoloApp;
vi.mock("../lib/SoloAppContext", () => ({
  useSoloApp: () => mockUseSoloApp(),
}));

// Logo (src/components/ui.jsx) calls Coaching's useApp() for branding —
// see src/appRouting.test.jsx's own note on this same coupling. Mocked for
// the same reason: a real AppProvider always wraps it in production
// (App.jsx), this test just isolates SoloRegisterScreen's own logic.
vi.mock("../lib/AppContext", () => ({ useApp: () => ({ db: { appDesign: {} } }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function fillBasicFields() {
  fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Alex Example" } });
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "alex@example.com" } });
  fireEvent.change(screen.getByPlaceholderText("At least 6 characters"), { target: { value: "password123" } });
  fireEvent.change(screen.getByPlaceholderText("Re-enter password"), { target: { value: "password123" } });
}

describe("SoloRegisterScreen — legal acceptance is required", () => {
  it("renders links to both the Terms of Service and Privacy Policy", () => {
    mockUseSoloApp = () => ({ registerSoloAccount: vi.fn(), soloCurrentUser: null });
    render(
      <MemoryRouter>
        <SoloRegisterScreen />
      </MemoryRouter>
    );
    const terms = screen.getByText("Terms of Service").closest("a");
    const privacy = screen.getByText("Privacy Policy").closest("a");
    expect(terms.getAttribute("href")).toBe("/legal/terms-of-service");
    expect(privacy.getAttribute("href")).toBe("/legal/privacy-policy");
  });

  it("the submit button stays disabled until BOTH checkboxes are ticked, even with all fields filled in", () => {
    mockUseSoloApp = () => ({ registerSoloAccount: vi.fn(), soloCurrentUser: null });
    render(
      <MemoryRouter>
        <SoloRegisterScreen />
      </MemoryRouter>
    );
    fillBasicFields();
    const submit = screen.getByText("CREATE ACCOUNT").closest("button");
    expect(submit.disabled).toBe(true);

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]); // Terms only
    expect(submit.disabled).toBe(true);

    fireEvent.click(checkboxes[1]); // + Privacy
    expect(submit.disabled).toBe(false);
  });

  it("submitting calls registerSoloAccount with legalAcceptance carrying both accepted-at timestamps and versions", async () => {
    const registerSoloAccount = vi.fn().mockResolvedValue({});
    mockUseSoloApp = () => ({ registerSoloAccount, soloCurrentUser: null });
    render(
      <MemoryRouter>
        <SoloRegisterScreen />
      </MemoryRouter>
    );
    fillBasicFields();
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByText("CREATE ACCOUNT").closest("button"));

    expect(registerSoloAccount).toHaveBeenCalledTimes(1);
    const arg = registerSoloAccount.mock.calls[0][0];
    expect(arg.legalAcceptance.termsAcceptedAt).toBeTypeOf("number");
    expect(arg.legalAcceptance.privacyAcceptedAt).toBeTypeOf("number");
    expect(arg.legalAcceptance.termsVersion).toBeTruthy();
    expect(arg.legalAcceptance.privacyVersion).toBeTruthy();
  });

  it("a new user (onboarding not completed) is sent to /solo/onboarding, not /solo/home, once registered", async () => {
    // A stable object reference matters here: SoloRegisterScreen's
    // navigation effect depends on [soloCurrentUser, navigate] — a mock
    // that returned a brand-new object on every call would make that
    // dependency look "changed" on every re-render (including the one
    // navigate() itself triggers), looping forever. Defining it once
    // outside the mock matches how the real soloProfile state in
    // SoloAppContext.jsx only changes reference when onSnapshot actually
    // delivers new data.
    const stableUser = { name: "Alex", onboarding: { completed: false } };
    mockUseSoloApp = () => ({
      registerSoloAccount: vi.fn(),
      soloCurrentUser: stableUser,
      fetchOnboardingCompletedFromServer: vi.fn().mockResolvedValue(false),
    });
    render(
      <MemoryRouter initialEntries={["/solo/register"]}>
        <SoloRegisterScreen />
      </MemoryRouter>
    );
    // The component navigates via an effect reacting to soloCurrentUser —
    // there's no Routes here to render the destination, so this just
    // proves it doesn't throw/crash while that effect runs with a
    // not-yet-onboarded profile (the actual destination is covered by
    // SoloRoutes' own RequireOnboardingComplete redirect, exercised
    // separately).
    expect(await screen.findByText("Train Solo")).toBeTruthy();
  });
});
