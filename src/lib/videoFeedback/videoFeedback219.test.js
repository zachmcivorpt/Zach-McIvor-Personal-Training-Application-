// #219 Coach video feedback — the pure parts: the edit timeline (trim,
// split, remove a middle section, rearrange, undo), the written overview,
// the local-only draft store, the render maths, and the publish order
// (nothing leaves the device before Publish; a retry never duplicates).
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanSummary,
  emptyHistory,
  formatClock,
  locate,
  moveSegment,
  pushHistory,
  redo,
  removeSegment,
  replaceSegment,
  segmentsHash,
  splitSegment,
  summaryReady,
  totalDuration,
  trimSegment,
  undo,
  unusedSourceIds,
  MIN_SEGMENT_SEC,
} from "./timeline";
import {
  __resetMemoryStore,
  appendChunk,
  deleteProject,
  finalizeChunks,
  getBlob,
  loadProject,
  projectKeyFor,
  putBlob,
  saveProject,
  unfinishedRecordingIds,
} from "./localStore";
import { publishProject, ensureRendered, RENDER_BLOB_ID, POSTER_BLOB_ID } from "./publish";
import { gainAt, frameAlpha, outputSize, videoBitrateFor, audioWindow } from "./render";
import { pickVideoMimeType, isWebKitBrowser } from "./recorder";

const sources = { a: { id: "a", duration: 10 }, b: { id: "b", duration: 6 } };
const segs = () => [
  { id: "s1", sourceId: "a", in: 0, out: 10 },
  { id: "s2", sourceId: "b", in: 0, out: 6 },
];

describe("edit timeline", () => {
  it("trims a clip from the start and end, clamped to its recording", () => {
    let t = trimSegment(segs(), "s1", { in: 2 }, sources);
    t = trimSegment(t, "s1", { out: 8.5 }, sources);
    expect(t[0]).toMatchObject({ in: 2, out: 8.5 });
    expect(totalDuration(t)).toBe(12.5);
    // Past the recording / below zero are clamped.
    const c = trimSegment(segs(), "s1", { in: -3, out: 40 }, sources);
    expect(c[0]).toMatchObject({ in: 0, out: 10 });
  });

  it("never lets the handles cross (minimum clip length)", () => {
    const t = trimSegment(segs(), "s1", { in: 9.99 }, sources);
    expect(t[0].out - t[0].in).toBeGreaterThanOrEqual(MIN_SEGMENT_SEC - 1e-9);
  });

  it("splits a clip and removes a middle section (split twice, delete)", () => {
    let t = splitSegment(segs(), "s1", 3);
    expect(t.map((s) => [s.in, s.out])).toEqual([
      [0, 3],
      [3, 10],
      [0, 6],
    ]);
    t = splitSegment(t, t[1].id, 4); // 3..7 | 7..10
    t = removeSegment(t, t[1].id); // drop 3..7
    expect(t.map((s) => [s.sourceId, s.in, s.out])).toEqual([
      ["a", 0, 3],
      ["a", 7, 10],
      ["b", 0, 6],
    ]);
    expect(totalDuration(t)).toBe(12);
  });

  it("refuses a split that would leave a sliver", () => {
    const t = segs();
    expect(splitSegment(t, "s1", 0.1)).toBe(t);
    expect(splitSegment(t, "s1", 9.95)).toBe(t);
  });

  it("rearranges clips and replaces a re-recorded one in place", () => {
    expect(moveSegment(segs(), 1, 0).map((s) => s.id)).toEqual(["s2", "s1"]);
    const r = replaceSegment(segs(), "s1", [{ id: "n", sourceId: "c", in: 0, out: 4 }]);
    expect(r.map((s) => s.id)).toEqual(["n", "s2"]);
  });

  it("maps timeline time to a clip and its recording time", () => {
    const t = trimSegment(segs(), "s1", { in: 2, out: 6 }, sources); // 4 s, then 6 s
    expect(locate(t, 1)).toMatchObject({ index: 0, sourceTime: 3 });
    expect(locate(t, 5)).toMatchObject({ index: 1, offset: 1, sourceTime: 1 });
  });

  it("undo and redo walk the edit history", () => {
    const a = segs();
    const b = removeSegment(a, "s2");
    let h = pushHistory(emptyHistory(), a);
    const u = undo(h, b);
    expect(u.segments).toBe(a);
    const r = redo(u.history, u.segments);
    expect(r.segments).toBe(b);
    expect(undo(emptyHistory(), a)).toBeNull();
  });

  it("knows which recordings nothing (not even undo) still uses", () => {
    const t = removeSegment(segs(), "s2");
    expect(unusedSourceIds(sources, t, null)).toEqual(["b"]);
    expect(unusedSourceIds(sources, t, pushHistory(emptyHistory(), segs()))).toEqual([]);
  });

  it("a render is reused only for the exact same edit", () => {
    const a = segs();
    expect(segmentsHash(a)).toBe(segmentsHash(segs()));
    expect(segmentsHash(trimSegment(a, "s1", { in: 1 }, sources))).not.toBe(segmentsHash(a));
  });

  it("formats clock times", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(75.9)).toBe("1:15");
    expect(formatClock(3725)).toBe("1:02:05");
  });
});

describe("written overview", () => {
  it("needs the overall note; drops empty priorities and trims text", () => {
    expect(summaryReady({ overall: "   " })).toBe(false);
    expect(summaryReady({ overall: "Great week" })).toBe(true);
    const c = cleanSummary({ overall: " Great week ", nutrition: "", priorities: ["  Hit protein ", "", "Sleep 8h", "a", "b", "c", "d"] });
    expect(c.overall).toBe("Great week");
    expect(c.priorities).toEqual(["Hit protein", "Sleep 8h", "a", "b", "c"]);
  });
});

describe("local-only draft store (memory fallback, as jsdom has no IndexedDB)", () => {
  beforeEach(() => __resetMemoryStore());

  it("keys every draft to the coach and client and never returns another's", async () => {
    const key = projectKeyFor("coach-1", "client-a");
    await saveProject({ key, coachUid: "coach-1", clientId: "client-a", segments: [] });
    expect(await loadProject("coach-1", "client-a")).toMatchObject({ clientId: "client-a" });
    expect(await loadProject("coach-2", "client-a")).toBeNull();
    expect(await loadProject("coach-1", "client-b")).toBeNull();
  });

  it("joins a recording's saved seconds in order and recovers an unfinished one", async () => {
    const key = projectKeyFor("c", "x");
    await appendChunk(key, "rec1", 1, new Blob(["B"]));
    await appendChunk(key, "rec1", 0, new Blob(["A"]));
    expect(await unfinishedRecordingIds(key)).toEqual(["rec1"]);
    const blob = await finalizeChunks(key, "rec1", "video/mp4");
    expect(await blob.text()).toBe("AB");
    expect(blob.type).toBe("video/mp4");
    expect(await unfinishedRecordingIds(key)).toEqual([]);
    expect(await (await getBlob(key, "rec1")).text()).toBe("AB");
  });

  it("discarding deletes the draft, its recordings and half-saved pieces", async () => {
    const key = projectKeyFor("c", "x");
    await saveProject({ key, coachUid: "c", clientId: "x" });
    await putBlob(key, "rec1", new Blob(["A"]));
    await appendChunk(key, "rec2", 0, new Blob(["B"]));
    await deleteProject(key);
    expect(await loadProject("c", "x")).toBeNull();
    expect(await getBlob(key, "rec1")).toBeNull();
    expect(await unfinishedRecordingIds(key)).toEqual([]);
  });
});

describe("render maths", () => {
  it("fades the film in and out and ramps every cut (no clicks)", () => {
    expect(gainAt(0, 20, 0, 10)).toBe(0);
    expect(gainAt(5, 20, 0, 10)).toBe(1);
    expect(gainAt(10 - 0.006, 20, 0, 10)).toBeCloseTo(0.5, 1);
    expect(gainAt(10.006, 20, 10, 20)).toBeCloseTo(0.5, 1);
    expect(frameAlpha(0, 20)).toBe(0);
    expect(frameAlpha(10, 20)).toBe(1);
    expect(frameAlpha(20, 20)).toBe(0);
  });
  it("cuts audio to a clip's window sample-accurately", () => {
    // 1024-frame piece at 48 kHz starting at 0.99 s; clip keeps 1.00–1.01 s.
    expect(audioWindow(0.99, 1024, 48000, 1.0, 1.01)).toEqual({ skip: 480, count: 480, start: 0 });
    // piece wholly inside: everything kept, placed at its offset in the clip
    const w = audioWindow(2.5, 1024, 48000, 2.0, 5.0);
    expect(w.skip).toBe(0);
    expect(w.count).toBe(1024);
    expect(w.start).toBeCloseTo(0.5, 6);
    // piece wholly outside
    expect(audioWindow(6, 1024, 48000, 2, 5).count).toBe(0);
  });
  it("keeps the shape, caps at 1080p and uses even sizes", () => {
    expect(outputSize(3840, 2160)).toEqual({ width: 1920, height: 1080 });
    expect(outputSize(1080, 1920)).toEqual({ width: 1080, height: 1920 });
    expect(outputSize(641, 481)).toEqual({ width: 642, height: 482 });
  });
  it("lowers the bitrate for long films", () => {
    expect(videoBitrateFor(120, 1920, 1080)).toBeGreaterThan(videoBitrateFor(15 * 60, 1920, 1080));
  });
  it("records MP4/H.264 on iPhone/Safari and WebM (saved every second) elsewhere", () => {
    const all = () => true;
    expect(pickVideoMimeType(all, true)).toBe("video/mp4;codecs=avc1,mp4a.40.2");
    expect(pickVideoMimeType(all, false)).toBe("video/webm;codecs=vp9,opus");
    expect(pickVideoMimeType((t) => t.startsWith("video/mp4"), false)).toBe("video/mp4;codecs=avc1,mp4a.40.2");
    expect(pickVideoMimeType(() => false)).toBe("");
    expect(isWebKitBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148")).toBe(true);
    expect(isWebKitBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15")).toBe(true);
    expect(isWebKitBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36")).toBe(false);
  });
});

describe("publish", () => {
  function setup({ uploadFails = false } = {}) {
    const blobs = new Map();
    const saved = [];
    const deps = {
      renderTimeline: vi.fn(async () => ({ blob: new Blob(["FINAL"], { type: "video/mp4" }), poster: new Blob(["P"], { type: "image/jpeg" }), duration: 16, width: 1920, height: 1080, method: "test" })),
      getBlob: vi.fn(async (k, id) => blobs.get(`${k}::${id}`) || null),
      putBlob: vi.fn(async (k, id, b) => blobs.set(`${k}::${id}`, b)),
      deleteBlob: vi.fn(async (k, id) => blobs.delete(`${k}::${id}`)),
      saveProject: vi.fn(async (p) => saved.push(p)),
      uploadVideo: vi.fn(async (clientId, id, version) => {
        if (uploadFails) throw new Error("Upload timed out");
        return { url: `https://x/${id}_${version}.mp4`, path: `coachVideoFeedback/${clientId}/${id}_${version}.mp4` };
      }),
      uploadPoster: vi.fn(async (clientId, id, version) => ({ url: "https://x/p.jpg", path: `coachVideoFeedback/${clientId}/${id}_${version}_poster.jpg` })),
      saveFeedback: vi.fn(async () => {}),
      deleteStoragePath: vi.fn(),
    };
    const project = {
      key: "coach-1::client-a",
      coachUid: "coach-1",
      clientId: "client-a",
      feedbackId: "vf_1",
      checkInId: "resp-1",
      checkInDate: 1700000000000,
      sources,
      segments: segs(),
      summary: { overall: "Strong week", priorities: ["Protein", ""] },
      publish: {},
    };
    return { deps, project, saved, blobs };
  }

  it("renders, keeps the file on the device, uploads ONLY the final video, then saves and notifies once", async () => {
    const { deps, project } = setup();
    const order = [];
    deps.renderTimeline.mockImplementation(async () => {
      order.push("render");
      return { blob: new Blob(["FINAL"], { type: "video/mp4" }), poster: null, duration: 16, width: 1920, height: 1080, method: "test" };
    });
    deps.uploadVideo.mockImplementation(async (c, id, v, file) => {
      order.push("upload");
      expect(await file.text()).toBe("FINAL"); // never a raw recording
      return { url: "u", path: `coachVideoFeedback/${c}/${id}_${v}.mp4` };
    });
    deps.saveFeedback.mockImplementation(async () => order.push("save"));
    const fb = await publishProject({ project, coachUid: "coach-1", deps });
    expect(order).toEqual(["render", "upload", "save"]);
    expect(deps.uploadVideo).toHaveBeenCalledTimes(1);
    expect(deps.saveFeedback).toHaveBeenCalledWith(expect.objectContaining({ id: "vf_1", clientId: "client-a", checkInId: "resp-1", viewedAt: null }), { notify: "new" });
    expect(fb.summary).toEqual({ overall: "Strong week", nutrition: "", training: "", recovery: "", adjustments: "", priorities: ["Protein"] });
  });

  it("refuses to publish without the written overview, before touching anything", async () => {
    const { deps, project } = setup();
    await expect(publishProject({ project: { ...project, summary: { overall: "" } }, coachUid: "coach-1", deps })).rejects.toThrow(/overall/);
    expect(deps.renderTimeline).not.toHaveBeenCalled();
    expect(deps.uploadVideo).not.toHaveBeenCalled();
  });

  it("a failed upload keeps the finished video locally and the retry neither re-renders nor duplicates", async () => {
    const { deps, project, saved } = setup({ uploadFails: true });
    await expect(publishProject({ project, coachUid: "coach-1", deps })).rejects.toThrow(/timed out/);
    expect(deps.saveFeedback).not.toHaveBeenCalled();
    expect(await deps.getBlob(project.key, RENDER_BLOB_ID)).not.toBeNull();
    const afterFailure = saved[saved.length - 1];
    deps.uploadVideo.mockImplementation(async (c, id, v) => ({ url: "u", path: `coachVideoFeedback/${c}/${id}_${v}.mp4` }));
    await publishProject({ project: afterFailure, coachUid: "coach-1", deps });
    expect(deps.renderTimeline).toHaveBeenCalledTimes(1);
    expect(deps.saveFeedback).toHaveBeenCalledTimes(1);
    // Retrying again after success does nothing new (same doc id, no second notify).
    await publishProject({ project: saved[saved.length - 1], coachUid: "coach-1", deps });
    expect(deps.uploadVideo).toHaveBeenCalledTimes(2);
    expect(deps.saveFeedback).toHaveBeenCalledTimes(1);
  });

  it("replacing a published video tells the client it was updated and removes the old files", async () => {
    const { deps, project } = setup();
    const existing = { id: "vf_1", videoPath: "coachVideoFeedback/client-a/vf_1_old.mp4", posterPath: "coachVideoFeedback/client-a/vf_1_old_poster.jpg", createdAt: 5, publishedAt: 5 };
    const fb = await publishProject({ project, coachUid: "coach-1", existing, deps });
    expect(fb.publishedAt).toBe(5);
    expect(deps.saveFeedback).toHaveBeenCalledWith(expect.anything(), { notify: "updated" });
    expect(deps.deleteStoragePath).toHaveBeenCalledWith(existing.videoPath);
    expect(deps.deleteStoragePath).toHaveBeenCalledWith(existing.posterPath);
  });

  it("the preview render is the file that gets uploaded (no second render)", async () => {
    const { deps, project, saved } = setup();
    const r = await ensureRendered({ project, deps });
    expect(await r.rendered.text()).toBe("FINAL");
    expect(await deps.getBlob(project.key, POSTER_BLOB_ID)).not.toBeNull();
    await publishProject({ project: saved[saved.length - 1], coachUid: "coach-1", deps });
    expect(deps.renderTimeline).toHaveBeenCalledTimes(1);
  });
});
