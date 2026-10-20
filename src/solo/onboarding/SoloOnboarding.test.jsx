// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import SoloOnboarding from "./SoloOnboarding";

let mockUseSoloApp;
vi.mock("../../lib/SoloAppContext", () => ({
  useSoloApp: () => mockUseSoloApp(),
}));
vi.mock("../../lib/AppContext", () => ({ useApp: () => ({ db: { appDesign: {} } }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function tree(path) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/solo/onboarding" element={<SoloOnboarding />} />
        <Route path="/solo/home" element={<div>SOLO_HOME</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// `completed` is read fresh by mockUseSoloApp on every render, so a test
// can flip it via the returned `setCompleted` + `rerender` to simulate
// SoloAppContext's onSnapshot listener delivering an updated document —
// without actually wiring up Firestore.
function renderOnboarding({ answers = {}, completed = false, path = "/solo/onboarding", saveOnboardingAnswer = vi.fn() } = {}) {
  let currentCompleted = completed;
  mockUseSoloApp = () => ({
    soloAuthUser: { uid: "solo-uid-1" },
    soloCurrentUser: { name: "Alex", onboarding: { completed: currentCompleted, answers } },
    saveOnboardingAnswer,
    recordHealthConsent: vi.fn(),
  });
  const result = render(tree(path));
  return {
    saveOnboardingAnswer,
    setCompleted: (v) => {
      currentCompleted = v;
    },
    rerender: () => result.rerender(tree(path)),
  };
}

describe("SoloOnboarding — progression and back navigation", () => {
  it("a brand-new user sees the first question (age)", () => {
    renderOnboarding();
    expect(screen.getByText("How old are you?")).toBeTruthy();
  });

  it("answering and clicking Next advances to the next question", () => {
    renderOnboarding();
    fireEvent.change(screen.getByPlaceholderText("e.g. 28"), { target: { value: "30" } });
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Which of these best applies to you?")).toBeTruthy();
  });

  it("Next is disabled on a required question until it's answered", () => {
    renderOnboarding();
    const next = screen.getByText("Next").closest("button");
    expect(next.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("e.g. 28"), { target: { value: "30" } });
    expect(next.disabled).toBe(false);
  });

  it("Back returns to the previous question with its answer still selected", () => {
    renderOnboarding({ answers: { age: "30" } });
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Which of these best applies to you?")).toBeTruthy();
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText("How old are you?")).toBeTruthy();
    expect(screen.getByPlaceholderText("e.g. 28").value).toBe("30");
  });

  it("persists each answer via saveOnboardingAnswer as soon as it's given, not just on Next", () => {
    const { saveOnboardingAnswer } = renderOnboarding();
    fireEvent.change(screen.getByPlaceholderText("e.g. 28"), { target: { value: "30" } });
    expect(saveOnboardingAnswer).toHaveBeenCalledWith("solo-uid-1", expect.anything(), "age", "30");
  });
});

describe("SoloOnboarding — resume behaviour", () => {
  it("a user with some answers already saved resumes past them, not back at question 1", () => {
    renderOnboarding({ answers: { age: "30", sexForScreening: "male", lifestyleContext: "desk" } });
    expect(screen.getByText("What's your main training goal right now?")).toBeTruthy();
    expect(screen.queryByText("How old are you?")).toBeNull();
  });

  it("?review=1 reopens a COMPLETED questionnaire at question 1 instead of skipping to the end", () => {
    const fullAnswers = {
      age: "30",
      sexForScreening: "male",
      lifestyleContext: "desk",
      primaryGoal: "get_stronger",
      mainObstacles: ["time"],
      priorExperience: "beginner",
      currentRoutine: "not_training",
      trainingEnvironment: "home_gym",
      availableEquipment: ["dumbbells"],
      daysPerWeek: "3-4",
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
    renderOnboarding({ answers: fullAnswers, completed: true, path: "/solo/onboarding?review=1" });
    expect(screen.getByText("How old are you?")).toBeTruthy();
  });
});

describe("SoloOnboarding — exercise-safety screening behaviour", () => {
  it("shows the medical-review notice (not the home screen directly) when an APSS Stage 1 answer is 'yes'", () => {
    const answers = {
      age: "30",
      sexForScreening: "male",
      lifestyleContext: "desk",
      primaryGoal: "get_stronger",
      mainObstacles: ["time"],
      priorExperience: "beginner",
      currentRoutine: "not_training",
      trainingEnvironment: "home_gym",
      availableEquipment: ["dumbbells"],
      daysPerWeek: "3-4",
      sessionDuration: "30-45",
      preferredStyle: "strength",
      healthConsent: true,
      priorInjuriesSurgeries: "no",
      currentPainLimitations: "no",
      apss_heartCondition: "yes",
      apss_chestPain: "no",
      apss_dizziness: "no",
      apss_asthma: "no",
      apss_diabetesControl: "na",
      apss_otherConditions: "no",
    };
    // Resumes at the last unanswered required question (healthcareRestriction).
    renderOnboarding({ answers });
    fireEvent.click(screen.getByText(/^No$/));
    fireEvent.click(screen.getByText("Finish"));
    expect(screen.getByText("Before you start training")).toBeTruthy();
    expect(screen.queryByText("SOLO_HOME")).toBeNull();
  });
});

describe("SoloOnboarding — completing the questionnaire", () => {
  const fullAnswersMinusLast = {
    age: "30",
    sexForScreening: "male",
    lifestyleContext: "desk",
    primaryGoal: "get_stronger",
    mainObstacles: ["time"],
    priorExperience: "beginner",
    currentRoutine: "not_training",
    trainingEnvironment: "home_gym",
    availableEquipment: ["dumbbells"],
    daysPerWeek: "3-4",
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
  };

  it("does not navigate away just because the save resolved — only once soloCurrentUser genuinely reflects completed: true", async () => {
    // Regression test for the "Finish sends you back to the start" loop:
    // the save resolving is NOT sufficient proof of completion, since
    // RequireOnboardingComplete (SoloRoutes.jsx) reads `completed` from
    // soloCurrentUser, which only updates once SoloAppContext's
    // onSnapshot listener has actually delivered the updated document —
    // a separate async event with no ordering guarantee against the
    // save's own promise resolving. A fix that merely awaits the save
    // and then navigates unconditionally would pass this first
    // assertion by accident; genuinely waiting for soloCurrentUser is
    // what the second half proves.
    let resolveSave;
    const saveOnboardingAnswer = vi.fn(() => new Promise((resolve) => (resolveSave = resolve)));
    // Resumes at the last unanswered required question (healthcareRestriction).
    const { setCompleted, rerender } = renderOnboarding({ answers: fullAnswersMinusLast, saveOnboardingAnswer });
    fireEvent.click(screen.getByText(/^No$/));
    fireEvent.click(screen.getByText("Finish"));

    expect(screen.queryByText("SOLO_HOME")).toBeNull();

    // The save resolves, but soloCurrentUser (the real, Firestore-backed
    // source of truth) hasn't caught up yet — still must not navigate.
    resolveSave();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText("SOLO_HOME")).toBeNull();

    // Now the real completion flag arrives (simulating the onSnapshot
    // listener delivering the updated document).
    setCompleted(true);
    rerender();
    expect(await screen.findByText("SOLO_HOME")).toBeTruthy();
  });
});
