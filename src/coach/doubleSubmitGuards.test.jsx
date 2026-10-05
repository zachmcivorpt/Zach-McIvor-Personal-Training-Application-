// @vitest-environment jsdom
//
// Regression coverage for missing re-entrancy guards on three coach-side
// create/add actions: Save on a new Challenge, Save on a new Group, and
// Add on the "Add a Member" sheet. None of their Save/Add buttons were
// disabled while the underlying async write was in flight, so a fast
// double-click fired the handler twice before the sheet closed —
// createChallenge/createGroup mint a fresh doc id per call, so two clicks
// created two duplicate documents; AddMemberSheet's addPicked read the
// same stale group.memberIds prop twice and wrote duplicate member ids.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChallengeEditor } from "./CoachChallenges";
import { GroupEditor, AddMemberSheet } from "./CoachGroups";

const updateGroup = vi.fn();
vi.mock("../lib/AppContext", () => ({ useApp: () => ({ updateGroup }) }));

afterEach(() => {
  cleanup();
  updateGroup.mockClear();
});

// A save that never resolves on its own — lets the test fire a second
// click while the first is still "in flight," which is exactly the
// window the original bug fell through.
function pendingPromise() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

describe("ChallengeEditor Save button", () => {
  it("does not call onSave twice on a rapid double-click", async () => {
    const { promise, resolve } = pendingPromise();
    const onSave = vi.fn(() => promise);
    render(<ChallengeEditor challenge={null} activeClients={[]} onClose={() => {}} onSave={onSave} onDelete={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText(/October Consistency Challenge/), { target: { value: "Fall Challenge" } });
    const [startInput, endInput] = document.querySelectorAll('input[type="date"]');
    fireEvent.change(startInput, { target: { value: "2026-10-01" } });
    fireEvent.change(endInput, { target: { value: "2026-10-31" } });

    const saveBtn = screen.getByText("Save");
    fireEvent.click(saveBtn);
    fireEvent.click(saveBtn);
    fireEvent.click(saveBtn);
    resolve();

    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe("GroupEditor Save button", () => {
  it("does not call onSave twice on a rapid double-click", async () => {
    const { promise, resolve } = pendingPromise();
    const onSave = vi.fn(() => promise);
    render(<GroupEditor activeClients={[]} onClose={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByPlaceholderText(/Forge Your Path/), { target: { value: "Morning Crew" } });

    const saveBtn = screen.getByText("Save");
    fireEvent.click(saveBtn);
    fireEvent.click(saveBtn);
    resolve();

    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe("AddMemberSheet Add button", () => {
  it("does not write duplicate member ids on a rapid double-click", async () => {
    const { promise, resolve } = pendingPromise();
    updateGroup.mockImplementation(() => promise);
    const group = { id: "group-1", memberIds: ["existing-1"] };
    const activeClients = [{ id: "client-a", name: "Alice" }];
    render(<AddMemberSheet open group={group} activeClients={activeClients} onClose={() => {}} showToast={() => {}} />);

    fireEvent.click(screen.getByText("Alice"));
    const addBtn = screen.getByText(/Add \(1\)/);
    fireEvent.click(addBtn);
    fireEvent.click(addBtn);
    resolve();

    expect(updateGroup).toHaveBeenCalledTimes(1);
  });
});
