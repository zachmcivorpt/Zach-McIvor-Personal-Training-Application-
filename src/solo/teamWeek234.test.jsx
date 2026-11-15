// @vitest-environment jsdom
//
// #234: My Training's Team week section — the streak and both members'
// weeks from real-shaped activity docs, the invite row, and joining from a
// friend's invite link once signed in.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SOLO_THEMES } from "./SoloThemeContext";
import { PENDING_PARTNER_CODE_KEY } from "./partners";

let partners;
const joinPartner = vi.fn();
const ensurePartnerCode = vi.fn(() => Promise.resolve("ABC234"));
vi.mock("./partnerStore", () => ({
  usePartners: () => partners,
  joinPartner: (...a) => joinPartner(...a),
  ensurePartnerCode: (...a) => ensurePartnerCode(...a),
  endPartnership: vi.fn(() => Promise.resolve()),
}));

const { default: SoloTeamWeek } = await import("./SoloTeamWeek");

const t = SOLO_THEMES.dark;
const me = { id: "a", name: "Alex Doe" };
const TODAY = "2026-11-12"; // Thursday; week of Mon 9 Nov
const met = { done: 3, target: 3 };

function renderIt() {
  return render(<SoloTeamWeek profile={me} todayKey={TODAY} dark t={t} />);
}

beforeEach(() => {
  joinPartner.mockReset();
  localStorage.clear();
});
afterEach(cleanup);

describe("Team week", () => {
  it("says nothing until the pairs have loaded", () => {
    partners = { pairs: [], ready: false, activity: {} };
    const { container } = renderIt();
    expect(container.textContent).toBe("");
  });

  it("with no partner, offers the invite", async () => {
    partners = { pairs: [], ready: true, activity: {} };
    renderIt();
    fireEvent.click(screen.getByText("Train with a friend"));
    await waitFor(() => expect(screen.getByTestId("partner-code").textContent).toBe("ABC234"));
    expect(screen.getByText(/never your weights, body stats or photos/)).toBeTruthy();
  });

  it("shows the streak and both weeks from the activity docs", () => {
    partners = {
      ready: true,
      pairs: [{ id: "a_b", members: ["a", "b"], createdAt: new Date(2026, 9, 1).getTime() }],
      activity: {
        a: { firstName: "Alex", target: 3, weeks: { "2026-10-26": met, "2026-11-02": met, "2026-11-09": { done: 1, target: 3 } } },
        b: { firstName: "Blair", target: 2, weeks: { "2026-10-26": met, "2026-11-02": met, "2026-11-09": { done: 2, target: 2 } } },
      },
    };
    renderIt();
    expect(screen.getByText("You + Blair")).toBeTruthy();
    // Two full weeks before this one; this week isn't done yet but doesn't break it.
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("Weeks")).toBeTruthy();
    expect(screen.getByLabelText("You: 1 of 3 this week")).toBeTruthy();
    expect(screen.getByLabelText("Blair: 2 of 2 this week")).toBeTruthy();
    expect(screen.getByText("2 sessions to go between you")).toBeTruthy();
    expect(screen.getByText(/Add a partner/)).toBeTruthy();
  });

  it("a finished Team week says so and counts", () => {
    partners = {
      ready: true,
      pairs: [{ id: "a_b", members: ["a", "b"], createdAt: new Date(2026, 10, 1).getTime() }],
      activity: { a: { target: 3, weeks: { "2026-11-09": met } }, b: { firstName: "Blair", target: 3, weeks: { "2026-11-09": met } } },
    };
    renderIt();
    expect(screen.getByText("Team week done")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("Week")).toBeTruthy();
  });

  it("joins the friend from an invite link once signed in, then forgets the code", async () => {
    partners = { pairs: [], ready: true, activity: {} };
    localStorage.setItem(PENDING_PARTNER_CODE_KEY, "XYZ789");
    joinPartner.mockResolvedValue({ id: "a_z", firstName: "Sam" });
    renderIt();
    await waitFor(() => expect(screen.getByText("You're training with Sam. Team week starts now.")).toBeTruthy());
    expect(joinPartner).toHaveBeenCalledWith(me, "XYZ789", { pairs: [] });
    expect(localStorage.getItem(PENDING_PARTNER_CODE_KEY)).toBeNull();
  });
});
