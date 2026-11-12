// @vitest-environment jsdom
// #219 Coach video feedback — the recording workspace and the client's view,
// rendered for real with real-shaped data (db grouped by client, #167).
//  - Switching, collapsing and expanding the client information panels
//    never stops or restarts the recording (one camera request, one
//    recorder, never stopped).
//  - Recording and editing write nothing to Firestore and upload nothing.
//  - The client's Check-ins show the coach's film and overview; opening it
//    marks it watched.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.setConfig({ testTimeout: 30000 });

const CID = "client-a";
const now = Date.now();
const DAY = 86400000;
const fakeDb = {
  users: [{ id: CID, role: "client", name: "Sam Carter", nutritionTargets: { calories: 2200, proteinPct: 30, carbsPct: 42, fatPct: 28 } }],
  exercises: [{ id: "ex_squat", name: "Barbell Back Squat" }],
  weighIns: { [CID]: [{ id: "w1", clientId: CID, date: now - 9 * DAY, weight: 82.4 }, { id: "w2", clientId: CID, date: now - DAY, weight: 81.7 }] },
  nutritionLogs: { [CID]: [] },
  workoutLogs: { [CID]: [{ id: "l1", clientId: CID, date: now - 2 * DAY, dayLabel: "Lower A", entries: [{ exerciseId: "ex_squat", sets: [{ weight: 110, reps: 6 }] }] }] },
  scheduledWorkouts: { [CID]: [] },
  formResponses: { [CID]: [{ id: "r1", clientId: CID, formId: "f1", date: now - DAY, answers: { q1: "Good week" } }] },
  forms: [{ id: "f1", name: "Weekly Check-in", questions: [{ id: "q1", label: "How was it?", type: "text" }] }],
  progressPhotos: { [CID]: [] },
  bodyMetrics: { [CID]: [] },
  clientNotes: { [CID]: [] },
  clientPhases: { [CID]: [] },
  videoFeedback: { [CID]: [] },
  coachProfile: { name: "Zach McIvor" },
};
const app = {
  db: fakeDb,
  currentUser: { id: "coach-1", role: "coach" },
  saveVideoFeedback: vi.fn(),
  updateVideoFeedbackSummary: vi.fn(),
  deleteVideoFeedback: vi.fn(),
  markVideoFeedbackViewed: vi.fn(),
};
vi.mock("../../lib/AppContext", () => ({ useApp: () => app }));
const uploads = { video: vi.fn(), poster: vi.fn() };
vi.mock("../../lib/storage", () => ({
  uploadFeedbackVideo: (...a) => uploads.video(...a),
  uploadFeedbackPoster: (...a) => uploads.poster(...a),
  deleteStoragePath: vi.fn(),
}));

let recorders = [];
let getUserMedia;
class FakeRecorder {
  constructor(stream, opts) {
    this.stream = stream;
    this.mimeType = opts?.mimeType || "video/mp4";
    this.state = "inactive";
    this.stop = vi.fn(() => {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["frames"], { type: "video/mp4" }) });
      this.onstop?.();
    });
    recorders.push(this);
  }
  static isTypeSupported(t) {
    return t.startsWith("video/mp4");
  }
  start() {
    this.state = "recording";
  }
  pause() {
    this.state = "paused";
  }
  resume() {
    this.state = "recording";
  }
  requestData() {}
}

beforeEach(async () => {
  recorders = [];
  const track = { stop: vi.fn(), getSettings: () => ({ width: 1920, height: 1080 }) };
  const stream = { active: true, getTracks: () => [track], getVideoTracks: () => [track] };
  getUserMedia = vi.fn(async () => stream);
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  window.MediaRecorder = FakeRecorder;
  window.matchMedia = (q) => ({ matches: q.includes("768"), addEventListener() {}, removeEventListener() {} });
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  app.saveVideoFeedback.mockClear();
  uploads.video.mockClear();
  (await import("../../lib/videoFeedback/localStore")).__resetMemoryStore();
});
afterEach(() => cleanup());

describe("Video feedback workspace (#219)", () => {
  it("keeps one continuous recording while the coach switches, collapses, expands and resizes the client panels", async () => {
    const { default: Workspace } = await import("./VideoFeedbackWorkspace");
    render(<Workspace client={fakeDb.users[0]} checkInId="r1" checkInDate={now - DAY} onClose={() => {}} showToast={() => {}} />);
    const recordBtn = await screen.findByTestId("record-button");
    await waitFor(() => expect(recordBtn.disabled).toBe(false));
    await act(async () => fireEvent.click(recordBtn));
    await screen.findByTestId("rec-indicator");
    expect(recorders).toHaveLength(1);
    const rec = recorders[0];
    expect(rec.state).toBe("recording");

    for (const name of ["Weight", "Nutrition", "Training", "Lifts", "Check-ins", "Photos", "Notes", "Overview"]) {
      await act(async () => fireEvent.click(screen.getByRole("tab", { name })));
      expect(screen.getByTestId(`info-section-${name === "Check-ins" ? "checkins" : name.toLowerCase()}`)).toBeTruthy();
    }
    expect(screen.getByText("81.7")).toBeTruthy(); // Overview shows the real latest weigh-in
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Hide client information" })));
    expect(screen.getByTestId("client-info-panel").dataset.collapsed).toBe("true");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Show client information" })));
    fireEvent.pointerDown(screen.getByTestId("resize-handle"), { clientX: 400 });
    fireEvent.pointerMove(window, { clientX: 300 });
    fireEvent.pointerUp(window);
    await act(async () => fireEvent.click(screen.getByTestId("pause-button")));
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Weight" })));
    await act(async () => fireEvent.click(screen.getByTestId("pause-button")));
    const realNow = performance.now.bind(performance);
    const spy = vi.spyOn(performance, "now").mockImplementation(() => realNow() + 4000);

    // Same recorder, same camera, never stopped by any of that.
    expect(recorders).toHaveLength(1);
    expect(rec.stop).not.toHaveBeenCalled();
    expect(rec.state).toBe("recording");
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    // The step tabs are locked while recording.
    for (const tab of screen.getAllByRole("tab", { name: /Edit/ })) expect(tab.disabled).toBe(true);

    await act(async () => fireEvent.click(screen.getByTestId("stop-button")));
    await screen.findByTestId("timeline-clip-0");
    spy.mockRestore();
    expect(rec.stop).toHaveBeenCalledTimes(1);
    // Nothing went online.
    expect(app.saveVideoFeedback).not.toHaveBeenCalled();
    expect(uploads.video).not.toHaveBeenCalled();
  });

  it("can't publish without the written overview", async () => {
    const { default: Workspace } = await import("./VideoFeedbackWorkspace");
    render(<Workspace client={fakeDb.users[0]} checkInId="r1" checkInDate={now - DAY} onClose={() => {}} showToast={() => {}} />);
    const recordBtn = await screen.findByTestId("record-button");
    await waitFor(() => expect(recordBtn.disabled).toBe(false));
    await act(async () => fireEvent.click(recordBtn));
    // A take shorter than a fraction of a second is dropped; this one is 3 s.
    const realNow = performance.now.bind(performance);
    const spy = vi.spyOn(performance, "now").mockImplementation(() => realNow() + 3000);
    await act(async () => fireEvent.click(screen.getByTestId("stop-button")));
    spy.mockRestore();
    await screen.findByTestId("timeline-clip-0");
    const write = screen.getAllByRole("tab", { name: /Write/ })[0];
    await act(async () => fireEvent.click(write));
    expect(screen.getByRole("button", { name: "Review & publish" }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Overall progress"), { target: { value: "Great week" } });
    expect(screen.getByRole("button", { name: "Review & publish" }).disabled).toBe(false);
    expect(screen.getByTestId("summary-preview").textContent).toContain("Great week");
  });
});

describe("Client's coach feedback (#219)", () => {
  it("shows the newest film with NEW, opens it full page with the overview, and marks it watched", async () => {
    const { default: ClientVideoFeedback } = await import("../../client/VideoFeedbackClient");
    app.db = {
      ...fakeDb,
      videoFeedback: {
        [CID]: [
          { id: "vf2", clientId: CID, videoUrl: "https://x/v2.mp4", posterUrl: "https://x/p2.jpg", duration: 245, width: 1080, height: 1920, publishedAt: now, checkInDate: now - DAY, viewedAt: null, summary: { overall: "Strong week", priorities: ["Hit protein"] } },
          { id: "vf1", clientId: CID, videoUrl: "https://x/v1.mp4", duration: 180, width: 1920, height: 1080, publishedAt: now - 7 * DAY, viewedAt: now - 6 * DAY, summary: { overall: "Older", priorities: [] } },
        ],
      },
    };
    render(<ClientVideoFeedback userId={CID} />);
    expect(screen.getByText("NEW")).toBeTruthy();
    expect(screen.getByText("EARLIER FEEDBACK")).toBeTruthy();
    fireEvent.click(screen.getByTestId("latest-feedback"));
    const page = await screen.findByTestId("feedback-film-page");
    expect(page.querySelector("video").getAttribute("src")).toBe("https://x/v2.mp4");
    expect(page.textContent).toContain("Hit protein");
    expect(page.textContent).toContain("Strong week");
    expect(page.textContent).toContain("From Zach McIvor");
    expect(app.markVideoFeedbackViewed).toHaveBeenCalledWith("vf2");
    app.db = fakeDb;
  });

  it("portrait films keep their shape (no crop) in the player", async () => {
    const { default: Player } = await import("../../components/CinematicVideoPlayer");
    render(<Player src="https://x/v.mp4" width={1080} height={1920} duration={60} maxHeight="70vh" />);
    const stage = screen.getByTestId("cinematic-player");
    expect(stage.style.aspectRatio).toContain(String(1080 / 1920));
    expect(stage.getAttribute("style")).toMatch(/max-height: 70vh/);
    expect(stage.querySelector("video").className).toContain("object-contain");
  });
});
