// @vitest-environment jsdom
// #246 (weekly audit): after a workout note was sent, editing it kept saying
// "Sent to the client" with Send greyed out, though the client only had the
// old wording. "Sent" is now for that exact text.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

let ctx;
vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ctx }));
import { WorkoutLogCard } from "./CoachClientDetail";

afterEach(cleanup);
const log = { id: "l1", clientId: "u1", date: new Date("2026-11-13T09:00:00").getTime(), dayLabel: "Strength 1A", entries: [{ exerciseId: "bp", sets: [{ weight: 80, reps: 5 }] }] };
const card = () => <WorkoutLogCard log={log} exercisesById={{ bp: { id: "bp", name: "Bench Press" } }} defaultOpen />;

describe("edited workout note can be sent again (#246)", () => {
  it("Sent applies to the text that was sent, not the edited one", () => {
    ctx = {
      db: { clientNotes: { u1: [{ id: "n1", workoutLogId: "l1", text: "Great depth today" }] }, workoutComments: {}, messages: { u1: [] } },
      sendMessage: vi.fn(),
      addClientNote: vi.fn(),
      updateClientNote: vi.fn(),
      deleteClientNote: vi.fn(),
    };
    const { rerender } = render(card());
    fireEvent.click(screen.getByText("SEND TO CLIENT"));
    expect(screen.getByText("SENT").closest("button").disabled).toBe(true);
    // The coach edits the note (saved, not sent).
    ctx = { ...ctx, db: { ...ctx.db, clientNotes: { u1: [{ id: "n1", workoutLogId: "l1", text: "Great depth today, slow the lowering" }] } } };
    rerender(card());
    expect(screen.getByTestId("note-visibility").textContent).toMatch(/private until you send it/);
    const send = screen.getByText("SEND TO CLIENT").closest("button");
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(ctx.sendMessage.mock.calls.at(-1)[2]).toMatch(/\nGreat depth today, slow the lowering$/);
  });
});
