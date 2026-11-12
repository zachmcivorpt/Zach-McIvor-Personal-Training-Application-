// Coach video feedback (#219): the ONE place anything leaves the coach's
// device. Runs only when the coach presses Publish Feedback:
//
//   render the timeline locally -> keep the finished file on the device
//   -> upload it (+ thumbnail) -> save the feedback doc -> tell the client
//
// Each finished step is written to the local draft, so a retry after a
// dropped connection picks up where it stopped: a finished render is not
// rendered again, a finished upload is not uploaded again, and a saved doc
// is not saved (or announced) twice. The doc id is fixed per draft, so even
// a retry that does repeat a step overwrites rather than duplicates. The
// draft — and every local file — is only deleted by the caller once this
// resolves.
import { cleanSummary, segmentsHash, summaryReady } from "./timeline";

export const RENDER_BLOB_ID = "__render";
export const POSTER_BLOB_ID = "__poster";

export function newFeedbackId() {
  return `vf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function summaryKey(summary) {
  return JSON.stringify(cleanSummary(summary));
}

// Step 1 on its own: the finished video, rendered on the device and kept
// there (the coach's "Preview final video" uses this too, so the preview is
// the exact file that gets uploaded). Re-rendered only if the edit changed.
export async function ensureRendered({ project, deps, onStage, signal }) {
  if (!project?.segments?.length) throw new Error("Record something first.");
  const key = project.key;
  const hash = segmentsHash(project.segments);
  let draft = { ...project, publish: { ...(project.publish || {}) } };
  let rendered = draft.render?.hash === hash ? await deps.getBlob(key, RENDER_BLOB_ID) : null;
  let poster = rendered ? await deps.getBlob(key, POSTER_BLOB_ID) : null;
  if (!rendered) {
    onStage?.({ stage: "render", progress: 0 });
    const out = await deps.renderTimeline({
      segments: draft.segments,
      sources: draft.sources,
      getSourceBlob: (id) => deps.getBlob(key, id),
      onProgress: (p) => onStage?.({ stage: "render", progress: p }),
      signal,
    });
    rendered = out.blob;
    poster = out.poster || null;
    await deps.putBlob(key, RENDER_BLOB_ID, rendered);
    if (poster) await deps.putBlob(key, POSTER_BLOB_ID, poster);
    else await deps.deleteBlob?.(key, POSTER_BLOB_ID);
    draft = {
      ...draft,
      render: { hash, duration: out.duration, width: out.width, height: out.height, method: out.method, version: Date.now().toString(36), size: rendered.size },
      // A new render has to be uploaded again.
      publish: {},
    };
    await deps.saveProject(draft);
  }
  return { draft, rendered, poster, hash };
}

// deps: { renderTimeline, getBlob, putBlob, deleteBlob, saveProject,
//         uploadVideo, uploadPoster, saveFeedback, deleteStoragePath }
// existing: the published feedback doc this replaces (or null).
// onStage({ stage: "render"|"upload"|"save"|"done", progress }).
export async function publishProject({ project, coachUid, existing = null, deps, onStage, signal }) {
  if (!project?.segments?.length) throw new Error("Record something before publishing.");
  if (!summaryReady(project.summary)) throw new Error("Add the overall progress note before publishing.");
  const ready = await ensureRendered({ project, deps, onStage, signal });
  let draft = ready.draft;
  const { rendered, poster, hash } = ready;
  const persist = async (patch) => {
    draft = { ...draft, ...patch };
    await deps.saveProject(draft);
    return draft;
  };

  const version = draft.render.version;

  // 2. Upload the finished video only.
  if (draft.publish.uploadedHash !== hash || !draft.publish.videoUrl) {
    onStage?.({ stage: "upload", progress: 0 });
    const video = await deps.uploadVideo(draft.clientId, draft.feedbackId, version, rendered, (p) => onStage?.({ stage: "upload", progress: p * 0.95 }));
    const posterUp = poster ? await deps.uploadPoster(draft.clientId, draft.feedbackId, version, poster).catch(() => ({ url: null, path: null })) : { url: null, path: null };
    await persist({
      publish: { uploadedHash: hash, videoUrl: video.url, videoPath: video.path, posterUrl: posterUp.url, posterPath: posterUp.path },
    });
  }

  // 3. Save the feedback the client sees, then tell them (once).
  const savedKey = `${hash}#${summaryKey(draft.summary)}`;
  const now = Date.now();
  const feedback = {
    id: draft.feedbackId,
    clientId: draft.clientId,
    coachId: coachUid,
    checkInId: draft.checkInId || null,
    checkInDate: draft.checkInDate || null,
    videoUrl: draft.publish.videoUrl,
    videoPath: draft.publish.videoPath,
    posterUrl: draft.publish.posterUrl || null,
    posterPath: draft.publish.posterPath || null,
    duration: draft.render.duration,
    width: draft.render.width || 0,
    height: draft.render.height || 0,
    summary: cleanSummary(draft.summary),
    createdAt: existing?.createdAt || now,
    publishedAt: existing?.publishedAt || now,
    updatedAt: now,
    version,
    // A new video is new to the client again.
    viewedAt: null,
  };
  if (draft.publish.savedKey !== savedKey) {
    onStage?.({ stage: "save", progress: 1 });
    const isNewVideo = !existing || existing.videoPath !== feedback.videoPath;
    await deps.saveFeedback(feedback, { notify: !existing ? "new" : isNewVideo ? "updated" : null });
    await persist({ publish: { ...draft.publish, savedKey } });
    // The replaced version's files are no longer used by anyone.
    if (existing && existing.videoPath && existing.videoPath !== feedback.videoPath) {
      deps.deleteStoragePath?.(existing.videoPath);
      if (existing.posterPath && existing.posterPath !== feedback.posterPath) deps.deleteStoragePath?.(existing.posterPath);
    }
  }
  onStage?.({ stage: "done", progress: 1 });
  return feedback;
}
