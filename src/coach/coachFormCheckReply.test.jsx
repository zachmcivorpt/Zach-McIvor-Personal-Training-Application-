// @vitest-environment jsdom
//
// A coach replying to a client's form-check video: the reply carries
// replyTo (message id + exercise) so the client sees it next to that
// exercise in their next workout.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const sendMessage = vi.fn();
vi.mock("../lib/AppContext", () => ({
  useApp: () => ({
    db: {
      messages: {
        c1: [
          {
            id: "m1",
            from: "client",
            clientId: "c1",
            text: "Form check: Bench Press · Set 2 · 60kg × 8",
            date: 1,
            attachment: { type: "video", url: "https://x/v.mp4", formCheck: { exerciseId: "e1", exerciseName: "Bench Press", setNumber: 2, reps: 8, weight: 60 } },
          },
        ],
      },
    },
    sendMessage,
    updateUser: vi.fn(),
  }),
}));
vi.mock("../lib/storage", () => ({ uploadMessageVideo: vi.fn(), uploadMessagePdf: vi.fn(), uploadMessageImage: vi.fn(), uploadMessageAudio: vi.fn() }));

afterEach(cleanup);

describe("coach reply to a form check", () => {
  it("labels the form check and links the reply to its exercise", async () => {
    const { ThreadMessages } = await import("./CoachMessages");
    render(<ThreadMessages client={{ id: "c1", name: "Alice" }} />);
    expect(screen.getByText("Form check · Bench Press · Set 2 · 60kg × 8")).toBeTruthy();
    expect(screen.queryByText("Form check: Bench Press · Set 2 · 60kg × 8")).toBeNull(); // not repeated as text
    fireEvent.click(screen.getByText("Reply with feedback"));
    expect(screen.getByText(/Replying to form check/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Write your feedback..."), { target: { value: "Elbows tucked, nice depth" } });
    fireEvent.keyDown(screen.getByPlaceholderText("Write your feedback..."), { key: "Enter" });
    expect(sendMessage).toHaveBeenCalledWith("c1", "coach", "Elbows tucked, nice depth", undefined, {
      replyTo: { messageId: "m1", exerciseId: "e1", exerciseName: "Bench Press" },
    });
    expect(screen.queryByText(/Replying to form check/)).toBeNull();
  });
});
