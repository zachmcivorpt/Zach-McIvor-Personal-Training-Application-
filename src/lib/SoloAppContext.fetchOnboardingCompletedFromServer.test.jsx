// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { SoloAppProvider, useSoloApp } from "./SoloAppContext";

vi.mock("./firebase", () => ({ soloAuth: {}, soloDb: {} }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: () => () => {},
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  EmailAuthProvider: { credential: vi.fn() },
  reauthenticateWithCredential: vi.fn(),
  deleteUser: vi.fn(),
}));

let getDocFromServerMock;
let setDocMock;
let updateDocMock;
vi.mock("firebase/firestore", () => ({
  doc: (...args) => ({ path: args.slice(1).join("/") }),
  setDoc: (...args) => setDocMock(...args),
  updateDoc: (...args) => updateDocMock(...args),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  getDocs: vi.fn(),
  getDocFromServer: (...args) => getDocFromServerMock(...args),
  writeBatch: vi.fn(),
  onSnapshot: () => () => {},
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const FULL_ANSWERS = {
  age: "30",
  sexForScreening: "male",
  lifestyleContext: "desk",
  primaryGoal: "get_stronger",
  mainObstacles: ["time"],
  priorExperience: "beginner",
  currentRoutine: "not_training",
  trainingEnvironment: "home_gym",
  availableEquipment: ["dumbbells"],
  sessionsPerWeek: "3",
      trainingDays: [1, 3, 5],
  sessionDuration: "30-45",
  preferredStyle: "strength",
  healthConsent: true,
  priorInjuriesSurgeries: "no",
  currentPainLimitations: "no",
  apss_heartCondition: "no",
  apss_chestPain: "no",
  apss_dizziness: "no",
  apss_asthma: "no",
  apss_diabetesControl: "na",
  apss_otherConditions: "no",
  healthcareRestriction: "no",
};

function TestConsumer({ uid, onResult }) {
  const { fetchOnboardingCompletedFromServer } = useSoloApp();
  return (
    <button onClick={() => fetchOnboardingCompletedFromServer(uid).then(onResult)}>check</button>
  );
}

function renderConsumer(uid, onResult) {
  render(
    <SoloAppProvider>
      <TestConsumer uid={uid} onResult={onResult} />
    </SoloAppProvider>
  );
}

// Regression coverage for two historical write bugs now fixed (see
// saveOnboardingAnswer's/recordHealthConsent's own comments in
// SoloAppContext.jsx): a nested-object write that replaced the whole
// `onboarding` field, and later a setDoc+merge dot-key write that silently
// never touched the real nested path at all. Either could leave
// `completed: false` stuck on an account whose `answers` were actually
// already complete. This can reproduce even in a brand-new private-
// browsing session (no local cache involved at all), since it's the real
// server document that's inconsistent, not a stale read of it. The
// self-heal write itself uses updateDoc() (not setDoc+merge) — see
// fetchOnboardingCompletedFromServer's own comment for why that
// distinction is exactly what the second bug was.
describe("fetchOnboardingCompletedFromServer — self-heals a completed-flag/answers mismatch", () => {
  it("repairs `completed` to true, without touching `answers`, when stored answers already satisfy isComplete()", async () => {
    getDocFromServerMock = vi.fn().mockResolvedValue({
      data: () => ({ onboarding: { completed: false, answers: FULL_ANSWERS } }),
    });
    updateDocMock = vi.fn().mockResolvedValue(undefined);

    let result;
    renderConsumer("solo-uid-1", (r) => (result = r));
    fireEvent.click(screen.getByText("check"));

    await vi.waitFor(() => expect(result).toBe(true));
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const [, payload] = updateDocMock.mock.calls[0];
    expect(payload).toEqual({ "onboarding.completed": true });
  });

  it("does NOT fabricate completion when the stored answers are genuinely incomplete", async () => {
    getDocFromServerMock = vi.fn().mockResolvedValue({
      data: () => ({ onboarding: { completed: false, answers: { age: "30" } } }),
    });
    updateDocMock = vi.fn().mockResolvedValue(undefined);

    let result;
    renderConsumer("solo-uid-1", (r) => (result = r));
    fireEvent.click(screen.getByText("check"));

    await vi.waitFor(() => expect(result).toBe(false));
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it("does not re-write or re-check answers when the server already says completed: true", async () => {
    getDocFromServerMock = vi.fn().mockResolvedValue({
      data: () => ({ onboarding: { completed: true, answers: FULL_ANSWERS } }),
    });
    updateDocMock = vi.fn().mockResolvedValue(undefined);

    let result;
    renderConsumer("solo-uid-1", (r) => (result = r));
    fireEvent.click(screen.getByText("check"));

    await vi.waitFor(() => expect(result).toBe(true));
    expect(updateDocMock).not.toHaveBeenCalled();
  });
});
