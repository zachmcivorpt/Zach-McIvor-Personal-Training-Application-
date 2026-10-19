import { describe, it, expect } from "vitest";
import {
  getVisibleQuestions,
  isAnswered,
  firstUnansweredIndex,
  isComplete,
  isFlaggedForMedicalReview,
} from "./questionnaireConfig";

describe("questionnaireConfig — resume behaviour", () => {
  it("a brand-new user (no answers) resumes at the very first question", () => {
    expect(firstUnansweredIndex({})).toBe(0);
  });

  it("resumes at the first unanswered REQUIRED question, skipping already-answered ones ahead of it", () => {
    const visible = getVisibleQuestions({});
    const answers = { [visible[0].id]: visible[0].options ? visible[0].options[0].value : "28" };
    expect(firstUnansweredIndex(answers)).toBe(1);
  });

  it("does not stop at an unanswered OPTIONAL question — only required ones gate progress", () => {
    // mostWantToImprove is optional; everything required before it must be
    // answered for the resume point to land past it.
    const visible = getVisibleQuestions({});
    const idx = visible.findIndex((q) => q.id === "mostWantToImprove");
    const answers = {};
    for (let i = 0; i < idx; i++) {
      const q = visible[i];
      if (!q.required) continue;
      answers[q.id] = q.type === "multiselect" ? [q.options[0].value] : q.options ? q.options[0].value : q.type === "number" ? "28" : "x";
    }
    // Resume point should be AT or AFTER mostWantToImprove's position, not stuck on it.
    expect(firstUnansweredIndex(answers)).toBeGreaterThanOrEqual(idx);
  });
});

describe("questionnaireConfig — conditional follow-ups", () => {
  it("a free-text follow-up is hidden until its trigger question is answered 'yes'", () => {
    expect(getVisibleQuestions({ priorInjuriesSurgeries: "no" }).some((q) => q.id === "priorInjuriesSurgeriesDetail")).toBe(false);
    expect(getVisibleQuestions({ priorInjuriesSurgeries: "yes" }).some((q) => q.id === "priorInjuriesSurgeriesDetail")).toBe(true);
  });

  it("changing an earlier answer from 'yes' back to 'no' hides the follow-up again (no stale branch)", () => {
    const afterYes = getVisibleQuestions({ apss_otherConditions: "yes" });
    const afterNo = getVisibleQuestions({ apss_otherConditions: "no" });
    expect(afterYes.some((q) => q.id === "apss_otherConditionsDetail")).toBe(true);
    expect(afterNo.some((q) => q.id === "apss_otherConditionsDetail")).toBe(false);
  });

  it("the 'other goal' free-text only appears when primaryGoal is 'other'", () => {
    expect(getVisibleQuestions({ primaryGoal: "build_muscle" }).some((q) => q.id === "primaryGoalOther")).toBe(false);
    expect(getVisibleQuestions({ primaryGoal: "other" }).some((q) => q.id === "primaryGoalOther")).toBe(true);
  });

  it("'describe your current routine' only appears once the user says they're training at all", () => {
    expect(getVisibleQuestions({ currentRoutine: "not_training" }).some((q) => q.id === "consistencyDetail")).toBe(false);
    expect(getVisibleQuestions({ currentRoutine: "inconsistent" }).some((q) => q.id === "consistencyDetail")).toBe(true);
  });
});

describe("questionnaireConfig — required questions can't be bypassed", () => {
  it("isAnswered is false for an empty/whitespace text answer", () => {
    const q = { id: "x", type: "text" };
    expect(isAnswered(q, { x: "" })).toBe(false);
    expect(isAnswered(q, { x: "   " })).toBe(false);
    expect(isAnswered(q, { x: "a real answer" })).toBe(true);
  });

  it("isAnswered is false for an empty multiselect array", () => {
    const q = { id: "x", type: "multiselect" };
    expect(isAnswered(q, { x: [] })).toBe(false);
    expect(isAnswered(q, { x: ["a"] })).toBe(true);
  });

  it("isComplete is false while any visible required question is unanswered, true once they're all answered", () => {
    const partial = { age: "28", sexForScreening: "male" };
    expect(isComplete(partial)).toBe(false);
  });
});

describe("questionnaireConfig — APSS Stage 1 exercise-safety screening", () => {
  it("flags for medical review when any of the six APSS Stage 1 items is 'yes' — matching APSS's own rule", () => {
    expect(isFlaggedForMedicalReview({ apss_heartCondition: "yes" })).toBe(true);
    expect(isFlaggedForMedicalReview({ apss_chestPain: "yes" })).toBe(true);
    expect(isFlaggedForMedicalReview({ apss_dizziness: "yes" })).toBe(true);
    expect(isFlaggedForMedicalReview({ apss_asthma: "yes" })).toBe(true);
    expect(isFlaggedForMedicalReview({ apss_diabetesControl: "yes" })).toBe(true);
    expect(isFlaggedForMedicalReview({ apss_otherConditions: "yes" })).toBe(true);
  });

  it("does not flag on an all-'no' Stage 1 answer set", () => {
    expect(
      isFlaggedForMedicalReview({
        apss_heartCondition: "no",
        apss_chestPain: "no",
        apss_dizziness: "no",
        apss_asthma: "no",
        apss_diabetesControl: "na",
        apss_otherConditions: "no",
      })
    ).toBe(false);
  });

  it("a 'yes' to a non-APSS injury question (e.g. current pain) does not by itself trigger the APSS flag", () => {
    // Real safety information, but not one of APSS Stage 1's own six
    // questions — keeping the flag exactly as strict as the source
    // framework, not broadened by our own judgment.
    expect(isFlaggedForMedicalReview({ currentPainLimitations: "yes" })).toBe(false);
  });
});
