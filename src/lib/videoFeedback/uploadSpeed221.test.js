// #221: publishing is quick (smaller finished file, thumbnail uploaded
// alongside, progress in MB with time left) and a new video is linked to
// the right check-in.
import { describe, expect, it, vi } from "vitest";
import { videoBitrateFor, wholeTakePlan } from "./render";
import { publishProject, uploadStatusText } from "./publish";
import { checkInToAnswer } from "../../coach/videoFeedback/CoachFeedbackPanel";

const MB = 1024 * 1024;
const fileMB = (secs, w, h) => ((videoBitrateFor(secs, w, h) + 128_000) * secs) / 8 / MB;

describe("finished file size (#221)", () => {
  it("a 5-minute 1080p film is about 100 MB (was ~165 MB)", () => {
    expect(fileMB(300, 1920, 1080)).toBeLessThan(105);
    expect(fileMB(300, 1920, 1080)).toBeGreaterThan(90);
  });
  it("longer films step down; smaller pictures scale down", () => {
    expect(videoBitrateFor(8 * 60, 1920, 1080)).toBeLessThan(videoBitrateFor(5 * 60, 1920, 1080));
    expect(videoBitrateFor(15 * 60, 1920, 1080)).toBeLessThan(videoBitrateFor(8 * 60, 1920, 1080));
    expect(videoBitrateFor(300, 1280, 720)).toBeLessThan(videoBitrateFor(300, 1920, 1080));
  });
  it("an untouched take recorded at ~5 Mbps is re-encoded smaller; an already-small one goes as recorded", () => {
    const secs = 300;
    expect(wholeTakePlan({ size: (5_000_000 * secs) / 8, duration: secs, width: 1920, height: 1080 })).toBe("reencode");
    expect(wholeTakePlan({ size: (2_600_000 * secs) / 8, duration: secs, width: 1920, height: 1080 })).toBe("original");
  });
});

describe("upload progress text (#221)", () => {
  it("shows MB done and the time left", () => {
    expect(uploadStatusText({ bytes: 25 * MB, total: 100 * MB, elapsedMs: 10_000 })).toBe("25 of 100 MB · about 30 s left");
    expect(uploadStatusText({ bytes: 10 * MB, total: 100 * MB, elapsedMs: 20_000 })).toBe("10 of 100 MB · about 3 min left");
    expect(uploadStatusText({ bytes: 0, total: 5 * MB, elapsedMs: 0 })).toBe("0.0 of 5.0 MB");
  });
});

describe("thumbnail uploads alongside the video (#221)", () => {
  it("starts the thumbnail before the video upload has finished", async () => {
    const blobs = new Map();
    let videoDone = false;
    let posterStartedBeforeVideoDone = null;
    const deps = {
      renderTimeline: async () => ({ blob: new Blob(["V"], { type: "video/mp4" }), poster: new Blob(["P"]), duration: 10, width: 1920, height: 1080, method: "t" }),
      getBlob: async (k, id) => blobs.get(id) || null,
      putBlob: async (k, id, b) => blobs.set(id, b),
      deleteBlob: async () => {},
      saveProject: async () => {},
      uploadVideo: async () => {
        await new Promise((r) => setTimeout(r, 20));
        videoDone = true;
        return { url: "v", path: "p/v.mp4" };
      },
      uploadPoster: async () => {
        posterStartedBeforeVideoDone = !videoDone;
        return { url: "p", path: "p/p.jpg" };
      },
      saveFeedback: vi.fn(async () => {}),
    };
    const project = { key: "k", clientId: "c", feedbackId: "vf", sources: { a: { duration: 10 } }, segments: [{ id: "s", sourceId: "a", in: 0, out: 10 }], summary: { overall: "x" }, publish: {} };
    await publishProject({ project, coachUid: "coach", deps });
    expect(posterStartedBeforeVideoDone).toBe(true);
    expect(deps.saveFeedback).toHaveBeenCalledWith(expect.objectContaining({ posterUrl: "p", videoUrl: "v" }), { notify: "new" });
  });
});

describe("which check-in a new video answers (#221)", () => {
  const r = (id, date) => ({ id, date });
  it("the newest check-in while it has no video", () => {
    expect(checkInToAnswer([r("old", 1), r("new", 2)], []).id).toBe("new");
  });
  it("never an older one once the newest is answered", () => {
    expect(checkInToAnswer([r("new", 2), r("old", 1)], [{ checkInId: "new" }])).toBeNull();
  });
  it("none when there are no check-ins", () => {
    expect(checkInToAnswer([], [])).toBeNull();
  });
});

describe("a failed upload doesn't send the thumbnail twice (#221)", () => {
  it("keeps the uploaded thumbnail on the draft for the retry", async () => {
    const blobs = new Map();
    let saved = null;
    let fail = true;
    const deps = {
      renderTimeline: async () => ({ blob: new Blob(["V"], { type: "video/mp4" }), poster: new Blob(["P"]), duration: 10, width: 1920, height: 1080, method: "t" }),
      getBlob: async (k, id) => blobs.get(id) || null,
      putBlob: async (k, id, b) => blobs.set(id, b),
      deleteBlob: async () => {},
      saveProject: async (p) => (saved = p),
      uploadVideo: vi.fn(async () => {
        if (fail) throw new Error("Upload timed out");
        return { url: "v", path: "p/v.mp4" };
      }),
      uploadPoster: vi.fn(async () => ({ url: "p", path: "p/p.jpg" })),
      saveFeedback: vi.fn(async () => {}),
    };
    const project = { key: "k", clientId: "c", feedbackId: "vf", sources: { a: { duration: 10 } }, segments: [{ id: "s", sourceId: "a", in: 0, out: 10 }], summary: { overall: "x" }, publish: {} };
    await expect(publishProject({ project, coachUid: "coach", deps })).rejects.toThrow(/timed out/);
    fail = false;
    await publishProject({ project: saved, coachUid: "coach", deps });
    expect(deps.uploadPoster).toHaveBeenCalledTimes(1);
    expect(deps.uploadVideo).toHaveBeenCalledTimes(2);
    expect(deps.saveFeedback).toHaveBeenCalledWith(expect.objectContaining({ posterUrl: "p", videoUrl: "v" }), { notify: "new" });
  });
});
