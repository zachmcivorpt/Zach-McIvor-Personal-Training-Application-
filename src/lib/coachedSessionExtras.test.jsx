// @vitest-environment jsdom
//
// Coached app: the lock-screen rest alert bridge, form-check videos linked
// to a set, and voice notes in chat.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { scheduleRestNotification, cancelRestNotification, restNotificationAvailable } from "./restNotification";
import { formCheckSet, formCheckLabel, formCheckMessageText, latestFormFeedback } from "./formCheck";
import { pickAudioMimeType, formatVoiceDuration } from "./voiceNote";
import { VoiceRecordingBar, VoiceNotePlayer } from "../components/VoiceNote";

afterEach(() => {
  cleanup();
  delete window.webkit;
});

describe("rest timer lock-screen alert", () => {
  it("asks the iPhone app for one alert at the end of the rest, and cancels it", () => {
    const posted = [];
    window.webkit = { messageHandlers: { apexRest: { postMessage: (m) => posted.push(m) } } };
    expect(restNotificationAvailable()).toBe(true);
    scheduleRestNotification(89.6, "Bench Press");
    scheduleRestNotification(5000);
    scheduleRestNotification(0.4); // under a second — nothing to schedule
    cancelRestNotification();
    expect(posted).toEqual([
      { action: "schedule", seconds: 90, title: "Rest's up", body: "Time for your next set of Bench Press." },
      { action: "schedule", seconds: 3600, title: "Rest's up", body: "Time for your next set." },
      { action: "cancel" },
    ]);
  });
  it("does nothing outside the iPhone app", () => {
    expect(restNotificationAvailable()).toBe(false);
    expect(() => {
      scheduleRestNotification(60);
      cancelRestNotification();
    }).not.toThrow();
  });
});

describe("form-check videos", () => {
  it("tags the last set with reps entered", () => {
    expect(formCheckSet([{ weight: "60", reps: "8" }, { weight: "62.5", reps: "6" }, { weight: "", reps: "" }])).toEqual({ setNumber: 2, reps: 6, weight: 62.5 });
    expect(formCheckSet([{ weight: "", reps: "12" }])).toEqual({ setNumber: 1, reps: 12, weight: 0 });
    expect(formCheckSet([{ weight: "", reps: "" }])).toEqual({ setNumber: 1, reps: null, weight: 0 });
  });
  it("labels the message with exercise, set and load", () => {
    const fc = { exerciseId: "e1", exerciseName: "Bench Press", setNumber: 2, reps: 6, weight: 62.5 };
    expect(formCheckLabel(fc)).toBe("Bench Press · Set 2 · 62.5kg × 6");
    expect(formCheckMessageText(fc)).toBe("Form check: Bench Press · Set 2 · 62.5kg × 6");
    expect(formCheckLabel({ ...fc, weight: 0, reps: 12 })).toBe("Bench Press · Set 2 · 12 reps");
    expect(formCheckLabel({ ...fc, reps: null })).toBe("Bench Press · Set 2");
  });
  it("finds the coach's latest reply about that exercise only", () => {
    const thread = [
      { id: "1", from: "coach", text: "old", replyTo: { exerciseId: "e1" } },
      { id: "2", from: "client", text: "q", replyTo: { exerciseId: "e1" } },
      { id: "3", from: "coach", text: "other exercise", replyTo: { exerciseId: "e2" } },
      { id: "4", from: "coach", text: "newest", replyTo: { exerciseId: "e1" } },
      { id: "5", from: "coach", text: "plain message" },
    ];
    expect(latestFormFeedback(thread, "e1").id).toBe("4");
    expect(latestFormFeedback(thread, "e9")).toBeNull();
  });
});

describe("voice notes", () => {
  it("records in a format the device supports (mp4 on iPhone, webm on Chrome)", () => {
    expect(pickAudioMimeType(() => true)).toBe("audio/mp4;codecs=mp4a.40.2"); // AAC when the device can
    expect(pickAudioMimeType((t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(pickAudioMimeType((t) => t.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(pickAudioMimeType(() => false)).toBe("");
  });
  it("formats lengths as m:ss", () => {
    expect(formatVoiceDuration(7)).toBe("0:07");
    expect(formatVoiceDuration(125)).toBe("2:05");
  });
  it("recording bar cancels or sends", () => {
    const onCancel = vi.fn();
    const onSend = vi.fn();
    render(<VoiceRecordingBar seconds={7} onCancel={onCancel} onSend={onSend} />);
    expect(screen.getByText(/Recording 0:07/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel voice note" }));
    fireEvent.click(screen.getByRole("button", { name: "Send voice note" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledTimes(1);
  });
  it("plays a voice note with its length", () => {
    const { container } = render(<VoiceNotePlayer attachment={{ type: "audio", url: "https://x/v.m4a", durationSec: 9 }} />);
    expect(container.querySelector("audio").getAttribute("src")).toBe("https://x/v.m4a");
    expect(screen.getByText(/Voice note · 0:09/)).toBeTruthy();
  });
});
