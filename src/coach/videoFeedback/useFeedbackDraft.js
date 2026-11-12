// Coach video feedback (#219): the unpublished draft for one client, held on
// this device only (src/lib/videoFeedback/localStore.js). Autosaves every
// change locally — never uploads. Recovers a take that was still recording
// when the page went away.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteBlob,
  deleteProject,
  finalizeChunks,
  getBlob,
  loadProject,
  projectKeyFor,
  putBlob,
  requestPersistentStorage,
  saveProject,
  unfinishedRecordingIds,
} from "../../lib/videoFeedback/localStore";
import {
  emptyHistory,
  emptySummary,
  insertSegments,
  pushHistory,
  redo as redoHistory,
  replaceSegment,
  segmentForSource,
  undo as undoHistory,
  unusedSourceIds,
} from "../../lib/videoFeedback/timeline";
import { newFeedbackId, POSTER_BLOB_ID, RENDER_BLOB_ID } from "../../lib/videoFeedback/publish";
import { probeVideo } from "../../lib/videoFeedback/render";

export function newDraft({ coachUid, clientId, checkInId = null, checkInDate = null, existing = null }) {
  return {
    key: projectKeyFor(coachUid, clientId),
    coachUid,
    clientId,
    feedbackId: existing?.id || newFeedbackId(),
    replacingId: existing?.id || null,
    checkInId: existing?.checkInId ?? checkInId,
    checkInDate: existing?.checkInDate ?? checkInDate,
    sources: {},
    segments: [],
    summary: existing?.summary ? { ...emptySummary(), ...existing.summary, priorities: [...(existing.summary.priorities || []), "", "", ""].slice(0, Math.max(3, (existing.summary.priorities || []).length)) } : emptySummary(),
    pendingTakes: {},
    render: null,
    publish: {},
    createdAt: Date.now(),
  };
}

async function describeTake(blob, fallback = {}) {
  try {
    const info = await probeVideo(blob);
    if (info.duration > 0) return { ...fallback, ...info };
  } catch {
    // keep the measured values
  }
  return fallback;
}

export function useFeedbackDraft({ coachUid, clientId, checkInId, checkInDate, existing }) {
  const [project, setProject] = useState(null);
  const [history, setHistory] = useState(emptyHistory());
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [notice, setNotice] = useState("");
  const [resumed, setResumed] = useState(false);
  const projectRef = useRef(null);
  const savedOnceRef = useRef(false);
  const saveTimer = useRef(null);
  const urls = useRef(new Map());

  const persistNow = useCallback(async (p) => {
    if (!p) return;
    setSaveState("saving");
    try {
      await saveProject(p);
      savedOnceRef.current = true;
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, []);

  const commit = useCallback(
    (next, { undoable = false, immediate = false } = {}) => {
      const prev = projectRef.current;
      if (undoable && prev) setHistory((h) => pushHistory(h, prev.segments));
      projectRef.current = next;
      setProject(next);
      clearTimeout(saveTimer.current);
      if (immediate) persistNow(next);
      else saveTimer.current = setTimeout(() => persistNow(projectRef.current), 350);
    },
    [persistNow]
  );

  // Load (or start) the draft, recovering any take that was cut off.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        requestPersistentStorage();
        let p = await loadProject(coachUid, clientId);
        const wasSaved = !!p;
        if (!p) p = newDraft({ coachUid, clientId, checkInId, checkInDate, existing });
        const unfinished = new Set([...(await unfinishedRecordingIds(p.key)), ...Object.keys(p.pendingTakes || {})]);
        let recovered = 0;
        for (const sourceId of unfinished) {
          if (p.sources[sourceId]) continue;
          let blob = await finalizeChunks(p.key, sourceId, p.pendingTakes?.[sourceId]?.mime).catch(() => null);
          if (!blob) blob = await getBlob(p.key, sourceId);
          if (!blob || blob.size === 0) continue;
          const info = await describeTake(blob, { duration: 0, width: 0, height: 0 });
          if (!(info.duration > 0)) continue;
          const source = { id: sourceId, mime: blob.type, duration: info.duration, width: info.width, height: info.height, createdAt: p.pendingTakes?.[sourceId]?.startedAt || Date.now() };
          p = { ...p, sources: { ...p.sources, [sourceId]: source }, segments: [...p.segments, segmentForSource(source)] };
          recovered++;
        }
        p = { ...p, pendingTakes: {} };
        // Recordings nothing on the timeline uses (undo history isn't kept
        // across visits).
        const unused = unusedSourceIds(p.sources, p.segments, null);
        if (unused.length) {
          await Promise.all(unused.map((id) => deleteBlob(p.key, id).catch(() => {})));
          const sources = { ...p.sources };
          unused.forEach((id) => delete sources[id]);
          p = { ...p, sources };
        }
        if (cancelled) return;
        projectRef.current = p;
        setProject(p);
        setResumed(wasSaved && (p.segments.length > 0 || recovered > 0));
        if (recovered) {
          setNotice(`Recovered ${recovered === 1 ? "an unfinished recording" : `${recovered} unfinished recordings`} from this device.`);
          await saveProject(p);
          savedOnceRef.current = true;
        } else if (wasSaved) savedOnceRef.current = true;
        setStatus("ready");
      } catch (err) {
        console.error("video feedback draft load failed:", err);
        if (!cancelled) {
          const p = newDraft({ coachUid, clientId, checkInId, checkInDate, existing });
          projectRef.current = p;
          setProject(p);
          setNotice("This device couldn't open its saved drafts, so this recording may not survive a reload.");
          setStatus("ready");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Opened once per client.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachUid, clientId]);

  // Revoke preview URLs and flush the last save when leaving.
  useEffect(
    () => () => {
      clearTimeout(saveTimer.current);
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      urls.current.clear();
      if (projectRef.current && savedOnceRef.current) saveProject(projectRef.current).catch(() => {});
    },
    []
  );

  const getSourceUrl = useCallback(async (sourceId) => {
    const p = projectRef.current;
    if (!p) return null;
    if (urls.current.has(sourceId)) return urls.current.get(sourceId);
    const blob = await getBlob(p.key, sourceId);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urls.current.set(sourceId, url);
    return url;
  }, []);

  // A take started: remembered so it can be recovered if the page dies.
  const takeStarted = useCallback(
    ({ sourceId, mime }) => {
      const p = projectRef.current;
      if (!p) return;
      commit({ ...p, pendingTakes: { ...(p.pendingTakes || {}), [sourceId]: { mime, startedAt: Date.now() } } }, { immediate: true });
    },
    [commit]
  );

  // A take finished: onto the timeline (or in place of the clip being
  // re-recorded).
  const addTake = useCallback(
    async (take, { replaceSegId = null, insertAt = null } = {}) => {
      if (!take?.blob) return null;
      const info = await describeTake(take.blob, { duration: take.duration, width: take.width, height: take.height });
      const p = projectRef.current;
      const source = { id: take.sourceId, mime: take.blob.type || take.mime, duration: info.duration, width: info.width, height: info.height, createdAt: Date.now() };
      if (!(source.duration > 0.2)) {
        await deleteBlob(p.key, take.sourceId).catch(() => {});
        const pending = { ...(p.pendingTakes || {}) };
        delete pending[take.sourceId];
        commit({ ...p, pendingTakes: pending }, { immediate: true });
        return null;
      }
      const seg = segmentForSource(source);
      const pending = { ...(p.pendingTakes || {}) };
      delete pending[take.sourceId];
      const segments = replaceSegId ? replaceSegment(p.segments, replaceSegId, [seg]) : insertSegments(p.segments, insertAt, [seg]);
      commit({ ...p, sources: { ...p.sources, [source.id]: source }, segments, pendingTakes: pending }, { undoable: true, immediate: true });
      return seg;
    },
    [commit]
  );

  const setSegments = useCallback(
    (segments, opts = { undoable: true }) => {
      const p = projectRef.current;
      if (!p) return;
      commit({ ...p, segments }, opts);
    },
    [commit]
  );

  const setSummary = useCallback(
    (summary) => {
      const p = projectRef.current;
      if (!p) return;
      commit({ ...p, summary });
    },
    [commit]
  );

  // One undo step for a change made in many small moves (a trim drag).
  const pushUndoSnapshot = useCallback((previousSegments) => {
    setHistory((h) => pushHistory(h, previousSegments));
  }, []);

  const undo = useCallback(() => {
    const p = projectRef.current;
    const r = undoHistory(history, p.segments);
    if (!r) return;
    setHistory(r.history);
    commit({ ...p, segments: r.segments });
  }, [history, commit]);

  const redo = useCallback(() => {
    const p = projectRef.current;
    const r = redoHistory(history, p.segments);
    if (!r) return;
    setHistory(r.history);
    commit({ ...p, segments: r.segments });
  }, [history, commit]);

  // Everything for this draft off the device: recordings, the rendered
  // video, the half-saved pieces. Then a fresh, empty draft.
  const discard = useCallback(async () => {
    const p = projectRef.current;
    clearTimeout(saveTimer.current);
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current.clear();
    if (p) await deleteProject(p.key);
    const fresh = newDraft({ coachUid, clientId, checkInId: p?.checkInId ?? checkInId, checkInDate: p?.checkInDate ?? checkInDate, existing });
    projectRef.current = fresh;
    savedOnceRef.current = false;
    setProject(fresh);
    setHistory(emptyHistory());
    setResumed(false);
    setSaveState("idle");
  }, [coachUid, clientId, checkInId, checkInDate, existing]);

  // After a confirmed publish only.
  const clearAfterPublish = useCallback(async () => {
    const p = projectRef.current;
    clearTimeout(saveTimer.current);
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current.clear();
    savedOnceRef.current = false;
    projectRef.current = null;
    if (p) await deleteProject(p.key);
  }, []);

  const replaceProject = useCallback((p) => {
    projectRef.current = p;
    setProject(p);
  }, []);

  const getRenderedBlob = useCallback(async () => {
    const p = projectRef.current;
    return p ? getBlob(p.key, RENDER_BLOB_ID) : null;
  }, []);

  return {
    project,
    projectRef,
    status,
    saveState,
    notice,
    setNotice,
    resumed,
    history,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    getSourceUrl,
    takeStarted,
    addTake,
    setSegments,
    setSummary,
    pushUndoSnapshot,
    undo,
    redo,
    discard,
    clearAfterPublish,
    replaceProject,
    getRenderedBlob,
    storeDeps: { getBlob, putBlob, deleteBlob, saveProject, POSTER_BLOB_ID },
  };
}
