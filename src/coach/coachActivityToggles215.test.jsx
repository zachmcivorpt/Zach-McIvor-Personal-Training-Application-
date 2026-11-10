// @vitest-environment jsdom
// #215: the coach's own switches for client-activity push notifications.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import fs from "node:fs";

vi.mock("../lib/push", () => ({ enablePush: vi.fn(), disablePush: vi.fn(), isNativeApp: false }));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("coach notification switches (#215)", () => {
  it("shows Completed workouts, Progress photos and Weigh-ins, on by default, each saved on its own", async () => {
    localStorage.setItem("pushToken_coach-1", "tok");
    const { PushNotificationsCard } = await import("./CoachMore");
    const updateUser = vi.fn(() => Promise.resolve());
    render(<PushNotificationsCard userId="coach-1" notificationPrefs={{ messages: false }} updateUser={updateUser} showToast={vi.fn()} />);
    for (const label of ["Completed workouts", "Progress photos", "Weigh-ins"]) {
      expect(screen.getByLabelText(`Turn off ${label.toLowerCase()} notifications`)).toBeTruthy();
    }
    fireEvent.click(screen.getByLabelText("Turn off weigh-ins notifications"));
    expect(updateUser).toHaveBeenCalledWith("coach-1", {
      notificationPrefs: { messages: false, checkins: true, workouts: true, progressPhotos: true, weighIns: false },
    });
  });

  it("a weigh-in the coach types in is marked as the coach's", () => {
    const detail = fs.readFileSync("src/coach/CoachClientDetail.jsx", "utf8");
    expect(detail).toMatch(/logWeight\(client\.id, v, dateKey, \{ by: "coach" \}\)/);
    const ctx = fs.readFileSync("src/lib/AppContext.jsx", "utf8");
    expect(ctx).toMatch(/by === "coach" \? \{ loggedBy: "coach" \}/);
  });
});
