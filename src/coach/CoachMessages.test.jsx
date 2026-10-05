// @vitest-environment jsdom
//
// Regression coverage for the desktop Messages composer leaking a draft
// across clients: ThreadMessages keeps its draft/upload state in local
// useState, so switching the open thread directly from one client to
// another (no intermediate "closed" state) reused the same component
// instance and carried the previous client's unsent draft text into the
// new thread's composer. The fix keys <ThreadMessages> by client.id at
// its call site in CoachMessages.jsx's desktop two-pane view so React
// remounts it on switch. This test drives the real exported
// `CoachMessages` component end-to-end (not a hand-keyed ThreadMessages
// in the test itself) so it actually exercises that render-site fix —
// removing the `key` from CoachMessages.jsx must make this fail.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CoachMessages from "./CoachMessages";

vi.mock("../lib/AppContext", () => ({
  useApp: () => ({
    db: {
      users: [
        { id: "client-a", role: "client", status: "active", name: "Alice" },
        { id: "client-b", role: "client", status: "active", name: "Bob" },
      ],
      messages: {},
    },
    sendMessage: vi.fn(),
    updateUser: vi.fn(),
  }),
}));
vi.mock("../lib/storage", () => ({
  uploadMessageVideo: vi.fn(),
  uploadMessagePdf: vi.fn(),
  uploadMessageImage: vi.fn(),
}));

afterEach(() => cleanup());

describe("CoachMessages desktop two-pane view", () => {
  it("does not leak an unsent draft from one client's composer onto the next", () => {
    render(<CoachMessages />);

    fireEvent.click(screen.getByText("Alice"));
    const aliceInput = screen.getByPlaceholderText("Message Alice...");
    fireEvent.change(aliceInput, { target: { value: "draft meant for Alice" } });
    expect(aliceInput.value).toBe("draft meant for Alice");

    // Switch directly to Bob's thread without going through a "closed"
    // state — this is exactly the desktop-sidebar click that triggered
    // the original bug.
    fireEvent.click(screen.getByText("Bob"));

    expect(screen.getByPlaceholderText("Message Bob...").value).toBe("");
  });
});
