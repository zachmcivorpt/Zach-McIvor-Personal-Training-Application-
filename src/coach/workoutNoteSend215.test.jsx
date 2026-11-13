// @vitest-environment jsdom
// #215: a coach's workout note is private until they send it; Send to
// client puts it in the client's chat as a normal coach message.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

let ctx;
vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ctx }));
import { WorkoutLogCard } from "./CoachClientDetail";

afterEach(cleanup);
const log = { id: "l1", clientId: "u1", date: new Date("2026-11-13T09:00:00").getTime(), dayLabel: "Strength 1A", entries: [{ exerciseId: "bp", sets: [{ weight: 80, reps: 5 }] }] };
function setup({ notes = [], messages = [] } = {}) {
  ctx = {
    db: { clientNotes: { u1: notes }, workoutComments: {}, messages: { u1: messages } },
    sendMessage: vi.fn(),
    addClientNote: vi.fn(),
    updateClientNote: vi.fn(),
    deleteClientNote: vi.fn(),
  };
  render(<WorkoutLogCard log={log} exercisesById={{ bp: { id: "bp", name: "Bench Press" } }} defaultOpen />);
}

describe("workout note → client (#215)", () => {
  it("a saved note says it's private until sent, and Send to client messages the client once", () => {
    setup({ notes: [{ id: "n1", workoutLogId: "l1", text: "Great depth today" }] });
    expect(screen.getByTestId("note-visibility").textContent).toMatch(/private until you send it/);
    fireEvent.click(screen.getByText("SEND TO CLIENT"));
    expect(ctx.sendMessage).toHaveBeenCalledTimes(1);
    const [cid, from, text] = ctx.sendMessage.mock.calls[0];
    expect([cid, from]).toEqual(["u1", "coach"]);
    expect(text).toMatch(/^About your Strength 1A on .+:\nGreat depth today$/);
    expect(screen.getByText("SENT")).toBeTruthy();
    expect(screen.getByTestId("note-visibility").textContent).toMatch(/sent to the client/);
  });
  it("shows Sent when the chat already has it", () => {
    setup({ notes: [{ id: "n1", workoutLogId: "l1", text: "Great depth today" }], messages: [{ id: "m1", from: "coach", text: "About your Strength 1A on Fri 13 Nov:\nGreat depth today" }] });
    expect(screen.getByText("SENT").closest("button").disabled).toBe(true);
  });
  it("Save & send to client saves the note and sends it", () => {
    setup();
    fireEvent.click(screen.getByText("Add a note about this workout…"));
    fireEvent.change(screen.getByPlaceholderText(/private unless you send it/), { target: { value: "Drop the weight 5kg" } });
    fireEvent.click(screen.getByText(/Save & send to client/));
    expect(ctx.addClientNote).toHaveBeenCalledWith("u1", "Drop the weight 5kg", "l1");
    expect(ctx.sendMessage.mock.calls[0][2]).toMatch(/\nDrop the weight 5kg$/);
  });
});
