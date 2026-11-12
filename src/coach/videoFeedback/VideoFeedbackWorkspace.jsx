// Coach video feedback (#219): the recording workspace.
//
// One full-screen page (portalled like the client page, #217) with four
// steps — Record, Edit, Write, Publish — and no other navigation. Record
// and Edit put the camera (or the edit preview) beside the client's
// information: side by side and resizable from iPad width up, stacked with
// a resizable panel on iPhone, collapsible everywhere. The camera and its
// recorder belong to this component, not to the panel, so switching,
// resizing or collapsing panels never stops a recording.
//
// Nothing leaves the device until Publish Feedback (lib/videoFeedback/
// publish.js); the draft autosaves locally the whole time.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Circle, Pause, Square, Loader2, Check, AlertTriangle, RotateCcw, Trash2, Upload, HardDrive, Video } from "lucide-react";
import { useApp } from "../../lib/AppContext";
import { CoachGlass, GLASS, GLASS_BLUE, JARVIS_BACKDROP, GlassButton } from "../darkUI";
import { MEASURE_BLUE } from "../../theme";
import ClientInfoPanel from "./ClientInfoPanel";
import EditTimeline, { TimelinePreview } from "./EditTimeline";
import { useFeedbackDraft } from "./useFeedbackDraft";
import { useCameraRecorder, cameraRecordingSupported, MAX_TAKE_SECONDS } from "../../lib/videoFeedback/recorder";
import { projectKeyFor, storageEstimate, isPersistent } from "../../lib/videoFeedback/localStore";
import {
  formatClock,
  moveSegment,
  removeSegment,
  splitSegment,
  summaryReady,
  totalDuration,
  trimSegment,
  locate,
  segmentsHash,
} from "../../lib/videoFeedback/timeline";
import { ensureRendered, publishProject } from "../../lib/videoFeedback/publish";
import { renderTimeline } from "../../lib/videoFeedback/render";
import { uploadFeedbackVideo, uploadFeedbackPoster, deleteStoragePath } from "../../lib/storage";
import CinematicVideoPlayer from "../../components/CinematicVideoPlayer";
import VideoFeedbackSummary from "../../components/VideoFeedbackSummary";
import SummaryEditor from "./SummaryEditor";

const STEPS = [
  { id: "record", label: "Record" },
  { id: "edit", label: "Edit" },
  { id: "write", label: "Write" },
  { id: "publish", label: "Publish" },
];

const fmtDay = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "");

function useIsWide() {
  const query = "(min-width: 768px)";
  const [wide, setWide] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setWide(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return wide;
}

// --- camera stage -------------------------------------------------------
function CameraStage({ recorder, replacing, onRecord, onStop, onCancelReplace, onRetry }) {
  const videoRef = useRef(null);
  const { state, stream, elapsed, error } = recorder;
  useEffect(() => {
    const v = videoRef.current;
    if (v && v.srcObject !== stream) {
      v.srcObject = stream || null;
      if (stream) {
        try {
          v.play?.()?.catch?.(() => {});
        } catch {}
      }
    }
  }, [stream]);
  const recording = state === "recording";
  const paused = state === "paused";
  const busy = state === "saving" || state === "starting";

  return (
    <div className="absolute inset-0 bg-black overflow-hidden" data-testid="camera-stage">
      {/* Mirrored like a mirror; the recording itself is the right way round.
          Contained, not cropped: the coach sees the whole frame being recorded. */}
      <video ref={videoRef} muted playsInline autoPlay className="absolute inset-0 w-full h-full object-contain" style={{ transform: "scaleX(-1)" }} data-testid="camera-preview" />
      {!stream && state !== "error" && (
        <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm gap-2">
          <Loader2 size={16} className="animate-spin" /> Starting camera…
        </div>
      )}
      {state === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 gap-3">
          <AlertTriangle size={22} className="text-white/70" />
          <p className="text-white text-sm max-w-xs">{error}</p>
          <GlassButton tone="blue" onClick={onRetry}>
            Try again
          </GlassButton>
        </div>
      )}

      {/* Top: what's happening */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
        {(recording || paused) && (
          <span className="flex items-center gap-2 h-8 px-3 rounded-full text-white text-xs font-bold tabular-nums" style={GLASS} data-testid="rec-indicator">
            <span className={`w-2.5 h-2.5 rounded-full ${recording ? "animate-pulse" : ""}`} style={{ backgroundColor: recording ? MEASURE_BLUE : "rgba(255,255,255,0.5)" }} />
            {paused ? "PAUSED" : "REC"} {formatClock(elapsed)}
          </span>
        )}
        {replacing && (
          <span className="ml-auto flex items-center gap-2 h-8 pl-3 pr-1 rounded-full text-white text-xs font-semibold pointer-events-auto" style={GLASS}>
            Re-recording clip {replacing.index + 1}
            {!recording && !paused && (
              <button type="button" onClick={onCancelReplace} className="w-6 h-6 rounded-full flex items-center justify-center bg-white/10" aria-label="Cancel re-record">
                <X size={12} />
              </button>
            )}
          </span>
        )}
      </div>

      {/* Bottom: controls, always reachable */}
      <div className="absolute bottom-0 inset-x-0 p-3 flex items-center justify-center gap-4" style={{ background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.55))" }}>
        {!recording && !paused ? (
          <button
            type="button"
            onClick={onRecord}
            disabled={!stream || busy}
            aria-label="Start recording"
            data-testid="record-button"
            className="w-[68px] h-[68px] rounded-full flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform"
            style={{ border: "3px solid rgba(255,255,255,0.9)", boxShadow: "0 0 24px rgba(47,143,255,0.45)" }}
          >
            {busy ? <Loader2 size={22} className="text-white animate-spin" /> : <span className="w-[50px] h-[50px] rounded-full" style={{ backgroundColor: MEASURE_BLUE }} />}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={recording ? recorder.pause : recorder.resume}
              aria-label={recording ? "Pause recording" : "Resume recording"}
              data-testid="pause-button"
              className="w-12 h-12 rounded-full flex items-center justify-center text-white active:scale-95"
              style={GLASS}
            >
              {recording ? <Pause size={20} fill="currentColor" /> : <Circle size={20} fill={MEASURE_BLUE} color={MEASURE_BLUE} />}
            </button>
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop recording"
              data-testid="stop-button"
              className="w-[68px] h-[68px] rounded-full flex items-center justify-center active:scale-95"
              style={{ border: "3px solid rgba(255,255,255,0.9)" }}
            >
              <Square size={24} fill="white" color="white" />
            </button>
            <span className="w-12 text-center text-white/60 text-[10px] font-semibold leading-tight">{formatClock(MAX_TAKE_SECONDS - elapsed)} left</span>
          </>
        )}
      </div>
    </div>
  );
}

// --- the workspace -------------------------------------------------------
export default function VideoFeedbackWorkspace({ client, checkInId = null, checkInDate = null, existing = null, onClose, showToast }) {
  const { currentUser, saveVideoFeedback } = useApp();
  const coachUid = currentUser?.id;
  const draft = useFeedbackDraft({ coachUid, clientId: client.id, checkInId, checkInDate, existing });
  const { project } = draft;
  const isWide = useIsWide();

  const [step, setStep] = useState("record");
  const [section, setSection] = useState("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [split, setSplit] = useState(48); // % of width for the camera (iPad/desktop)
  const [panelFrac, setPanelFrac] = useState(0.42); // share of height for the panel (iPhone)
  const [selectedId, setSelectedId] = useState(null);
  const [playhead, setPlayhead] = useState(0);
  const [replaceTarget, setReplaceTarget] = useState(null); // segment id being re-recorded
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [storageNote, setStorageNote] = useState("");
  const [render, setRender] = useState({ status: "idle", progress: 0, url: null, posterUrl: null, error: "" });
  const [publish, setPublish] = useState({ status: "idle", stage: null, progress: 0, error: "" });
  const publishingRef = useRef(false);
  const previewRef = useRef(null);
  const trimSnapshotRef = useRef(null);
  const bodyRef = useRef(null);

  const recorder = useCameraRecorder({ projectKey: projectKeyFor(coachUid, client.id), onTakeStarted: draft.takeStarted });
  const recActive = recorder.state === "recording" || recorder.state === "paused" || recorder.state === "saving";
  const supported = cameraRecordingSupported();

  const segments = project?.segments || [];
  const sources = project?.sources || {};
  const total = totalDuration(segments);

  // iPhone: editing needs the room, so the panel folds to its icon strip
  // (one tap brings it back). Recording keeps it open.
  useEffect(() => {
    if (!isWide && step === "edit") setCollapsed(true);
  }, [step, isWide]);

  // Camera on only while recording is possible (battery, the camera light).
  useEffect(() => {
    if (draft.status !== "ready" || !supported) return;
    if (step === "record") recorder.startCamera();
    else if (!recActive) recorder.stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, draft.status, supported]);

  useEffect(() => {
    storageEstimate().then((est) => {
      if (est && est.free < 600 * 1024 * 1024) {
        const minutes = Math.max(0, Math.floor(est.free / (45 * 1024 * 1024)));
        setStorageNote(`Only ${Math.round(est.free / 1024 / 1024)} MB free for recordings on this device — about ${minutes} minute${minutes === 1 ? "" : "s"} of video.`);
      }
    });
  }, []);

  // The body page doesn't scroll behind the workspace.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // The finished-preview URL follows the rendered file.
  useEffect(() => () => {
    if (render.url) URL.revokeObjectURL(render.url);
    if (render.posterUrl) URL.revokeObjectURL(render.posterUrl);
  }, [render.url, render.posterUrl]);

  // Any edit makes the finished preview out of date.
  const editHash = segmentsHash(segments);
  useEffect(() => {
    setRender((r) => (r.hash && r.hash !== editHash ? { status: "idle", progress: 0, url: null, posterUrl: null, error: "" } : r));
  }, [editHash]);

  async function record() {
    const ok = await recorder.startRecording();
    if (!ok && recorder.error) showToast?.(recorder.error, true);
  }

  async function stopRecording() {
    const take = await recorder.stop();
    if (!take) {
      showToast?.("Nothing was recorded.", true);
      return;
    }
    const replaceIdx = replaceTarget ? segments.findIndex((s) => s.id === replaceTarget) : -1;
    const seg = await draft.addTake(take, { replaceSegId: replaceIdx >= 0 ? replaceTarget : null });
    setReplaceTarget(null);
    if (seg) {
      setSelectedId(seg.id);
      if (replaceIdx >= 0) setStep("edit");
    }
  }

  // --- editing --------------------------------------------------------
  const seek = useCallback((t) => {
    setPlayhead(t);
    previewRef.current?.seek(t);
  }, []);

  function onSplit() {
    const loc = locate(segments, playhead);
    if (!loc) return;
    const next = splitSegment(segments, loc.segment.id, loc.offset);
    if (next !== segments) {
      draft.setSegments(next);
      setSelectedId(next[loc.index + 1]?.id || null);
    }
  }
  function onDelete(id) {
    if (!id) return;
    const idx = segments.findIndex((s) => s.id === id);
    const next = removeSegment(segments, id);
    draft.setSegments(next);
    setSelectedId(next[Math.min(idx, next.length - 1)]?.id || null);
    setPlayhead((p) => Math.min(p, totalDuration(next)));
  }
  function onMove(from, to) {
    if (to < 0 || to >= segments.length) return;
    draft.setSegments(moveSegment(segments, from, to));
  }
  function onTrimLive(id, patch) {
    if (!trimSnapshotRef.current) trimSnapshotRef.current = segments;
    draft.setSegments(trimSegment(segments, id, patch, sources), { undoable: false });
  }
  function onTrimCommit() {
    if (trimSnapshotRef.current) draft.pushUndoSnapshot(trimSnapshotRef.current);
    trimSnapshotRef.current = null;
  }
  function onReRecord(id) {
    if (!id) return;
    setReplaceTarget(id);
    setStep("record");
  }

  // --- finished preview + publish ---------------------------------------
  const deps = useMemo(
    () => ({
      renderTimeline,
      getBlob: draft.storeDeps.getBlob,
      putBlob: draft.storeDeps.putBlob,
      deleteBlob: draft.storeDeps.deleteBlob,
      saveProject: async (p) => {
        await draft.storeDeps.saveProject(p);
        draft.replaceProject(p);
      },
      uploadVideo: uploadFeedbackVideo,
      uploadPoster: uploadFeedbackPoster,
      saveFeedback: saveVideoFeedback,
      deleteStoragePath,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saveVideoFeedback]
  );

  async function prepareFinal() {
    if (!draft.projectRef.current?.segments?.length || render.status === "rendering") return;
    const hash = segmentsHash(draft.projectRef.current.segments);
    setRender({ status: "rendering", progress: 0, url: null, posterUrl: null, error: "", hash });
    try {
      const out = await ensureRendered({
        project: draft.projectRef.current,
        deps,
        onStage: ({ progress }) => setRender((r) => ({ ...r, progress })),
      });
      setRender({ status: "ready", progress: 1, url: URL.createObjectURL(out.rendered), posterUrl: out.poster ? URL.createObjectURL(out.poster) : null, error: "", hash });
    } catch (err) {
      console.error("render failed:", err);
      setRender({ status: "error", progress: 0, url: null, posterUrl: null, error: err?.message || "The video couldn't be put together.", hash });
    }
  }

  useEffect(() => {
    if (step === "publish" && render.status === "idle" && segments.length && publish.status !== "done") prepareFinal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, render.status, segments.length]);

  async function doPublish() {
    if (publishingRef.current) return;
    publishingRef.current = true;
    setPublish({ status: "publishing", stage: "render", progress: 0, error: "" });
    try {
      await publishProject({
        project: draft.projectRef.current,
        coachUid,
        existing,
        deps,
        onStage: ({ stage, progress }) => setPublish((p) => ({ ...p, stage, progress })),
      });
      await draft.clearAfterPublish();
      setPublish({ status: "done", stage: "done", progress: 1, error: "" });
      showToast?.(existing ? "Feedback updated" : `Feedback sent to ${client.name?.split(" ")[0] || "your client"}`);
    } catch (err) {
      console.error("publish failed:", err);
      setPublish({ status: "error", stage: null, progress: 0, error: err?.message || "Publishing failed — check your connection and try again." });
    } finally {
      publishingRef.current = false;
    }
  }

  // --- layout drag handles ----------------------------------------------
  function startResize(e) {
    e.preventDefault();
    const body = bodyRef.current;
    if (!body) return;
    const rect = body.getBoundingClientRect();
    const move = (ev) => {
      if (isWide) setSplit(Math.max(28, Math.min(75, ((ev.clientX - rect.left) / rect.width) * 100)));
      else setPanelFrac(Math.max(0.25, Math.min(0.78, 1 - (ev.clientY - rect.top) / rect.height)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  const replacing = replaceTarget ? { index: segments.findIndex((s) => s.id === replaceTarget) } : null;
  const canLeaveRecord = !recActive;
  const ready = draft.status === "ready" && project;
  const summaryOk = project ? summaryReady(project.summary) : false;
  const draftForOtherCheckIn = draft.resumed && checkInId && project?.checkInId && project.checkInId !== checkInId;

  const stageStyle = isWide
    ? { width: collapsed ? "calc(100% - 56px)" : `${split}%` }
    : { height: collapsed ? "calc(100% - 52px)" : `${(1 - panelFrac) * 100}%` };
  const panelStyle = isWide ? { width: collapsed ? 56 : `calc(${100 - split}% - 10px)` } : { height: collapsed ? 52 : `calc(${panelFrac * 100}% - 10px)` };
  const saveLabel =
    draft.saveState === "saving" ? "Saving on this device…" : draft.saveState === "error" ? "Couldn't save on this device" : segments.length ? "Saved on this device" : "Nothing uploaded until you publish";

  const page = (
    <CoachGlass>
      <div className="fixed inset-0 z-[95] flex flex-col pt-safe" style={JARVIS_BACKDROP} data-testid="video-feedback-workspace" role="dialog" aria-label="Video feedback">
        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-3 md:px-5 h-14 border-b border-white/[0.07]">
          <button
            type="button"
            onClick={() => (recActive || publish.status === "publishing" ? showToast?.(recActive ? "Stop the recording first" : "Publishing — one moment", true) : onClose())}
            className="w-9 h-9 flex items-center justify-center text-white rounded-xl"
            style={GLASS}
            aria-label="Close video feedback"
          >
            <X size={17} />
          </button>
          <div className="min-w-0 flex-1 md:flex-none md:w-56">
            <p className="text-white text-sm font-semibold truncate">{existing ? "Replace video feedback" : "Video feedback"}</p>
            <p className="text-white/50 text-[11px] truncate">
              {client.name}
              {project?.checkInDate ? ` · check-in ${fmtDay(project.checkInDate)}` : ""}
            </p>
          </div>
          <div className="hidden md:flex flex-1 justify-center">
            <StepTabs step={step} setStep={setStep} locked={!canLeaveRecord} hasClips={segments.length > 0} />
          </div>
          <p className="hidden lg:flex items-center gap-1.5 text-white/45 text-[11px] w-56 justify-end">
            <HardDrive size={12} /> {saveLabel}
          </p>
        </div>
        <div className="md:hidden shrink-0 px-3 py-2 border-b border-white/[0.07]">
          <StepTabs step={step} setStep={setStep} locked={!canLeaveRecord} hasClips={segments.length > 0} />
        </div>

        {(draft.notice || storageNote || draftForOtherCheckIn || !isPersistent() || !supported) && (
          <div className="shrink-0 px-4 py-2 text-[12px] text-white/75 border-b border-white/[0.07] space-y-1" style={{ background: "rgba(47,143,255,0.06)" }}>
            {!supported && <p>This device can't record from the camera here. On iPhone, update APEX from the App Store; on a computer, use Chrome or Safari.</p>}
            {draft.notice && <p>{draft.notice}</p>}
            {!isPersistent() && <p>This browser can't keep recordings on the device — don't reload until you've published.</p>}
            {storageNote && <p>{storageNote}</p>}
            {draftForOtherCheckIn && (
              <p>
                Continuing your unpublished draft for the check-in from {fmtDay(project.checkInDate)}.{" "}
                <button type="button" className="underline font-semibold" onClick={() => setConfirmDiscard(true)}>
                  Start again
                </button>
              </p>
            )}
          </div>
        )}

        {!ready ? (
          <div className="flex-1 flex items-center justify-center text-white/60 text-sm gap-2" data-apex-loading>
            <Loader2 size={16} className="animate-spin" /> Opening your draft…
          </div>
        ) : step === "record" || step === "edit" ? (
          <div ref={bodyRef} className={`flex-1 min-h-0 flex ${isWide ? "flex-row" : "flex-col"} gap-0 p-2 md:p-3`} data-testid="workspace-body" data-layout={isWide ? "side" : "stacked"}>
            {/* Camera / preview column */}
            <div className="relative min-w-0 min-h-0 flex flex-col gap-2" style={stageStyle} data-testid="stage-column">
              <div className="relative flex-1 min-h-[140px] rounded-2xl overflow-hidden" style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.08)" }}>
                {step === "record" ? (
                  <CameraStage
                    recorder={recorder}
                    replacing={replacing}
                    onRecord={record}
                    onStop={stopRecording}
                    onCancelReplace={() => setReplaceTarget(null)}
                    onRetry={() => recorder.startCamera()}
                  />
                ) : (
                  <TimelinePreview ref={previewRef} segments={segments} getSourceUrl={draft.getSourceUrl} playhead={playhead} onPlayhead={setPlayhead} />
                )}
              </div>
              <div className="shrink-0 rounded-2xl px-2 py-2.5" style={GLASS}>
                <EditTimeline
                  compact={step === "record"}
                  trailing={
                    step === "record" && segments.length > 0 && !recActive ? (
                      <button type="button" onClick={() => setStep("edit")} className="text-[11px] font-bold tracking-[0.04em]" style={{ color: MEASURE_BLUE }}>
                        EDIT CLIPS →
                      </button>
                    ) : null
                  }
                  segments={segments}
                  sources={sources}
                  selectedId={selectedId}
                  onSelect={(id) => {
                    setSelectedId(id);
                    if (step === "edit") {
                      const seg = segments.find((s) => s.id === id);
                      const start = segments.indexOf(seg) >= 0 ? totalDuration(segments.slice(0, segments.indexOf(seg))) : 0;
                      seek(start);
                    }
                  }}
                  playhead={playhead}
                  onSeek={seek}
                  getSourceUrl={draft.getSourceUrl}
                  onTrimLive={onTrimLive}
                  onTrimCommit={onTrimCommit}
                  onSplit={onSplit}
                  onDelete={onDelete}
                  onMove={onMove}
                  onReRecord={onReRecord}
                  onAddRecording={() => (recActive ? null : setStep("record"))}
                  onUndo={draft.undo}
                  onRedo={draft.redo}
                  canUndo={draft.canUndo}
                  canRedo={draft.canRedo}
                  onPreviewSourceTime={(sid, t) => previewRef.current?.showSourceTime(sid, t)}
                />

              </div>
            </div>

            {/* Resize handle */}
            {!collapsed && (
              <div
                role="separator"
                aria-orientation={isWide ? "vertical" : "horizontal"}
                aria-label="Resize client information"
                onPointerDown={startResize}
                className={`shrink-0 flex items-center justify-center touch-none ${isWide ? "w-[10px] cursor-col-resize" : "h-[10px] cursor-row-resize"}`}
                data-testid="resize-handle"
              >
                <span className={`rounded-full bg-white/25 ${isWide ? "w-1 h-10" : "h-1 w-10"}`} />
              </div>
            )}

            {/* Client information */}
            <div className={`min-w-0 min-h-0 rounded-2xl overflow-hidden ${collapsed && !isWide ? "mt-2" : ""} ${collapsed && isWide ? "ml-2" : ""}`} style={{ ...GLASS, ...panelStyle }}>
              <ClientInfoPanel
                client={client}
                checkInId={project.checkInId}
                checkInDate={project.checkInDate}
                section={section}
                onSection={setSection}
                collapsed={collapsed}
                onToggleCollapsed={() => setCollapsed((c) => !c)}
                layout={isWide ? "side" : "bottom"}
              />
            </div>
          </div>
        ) : step === "write" ? (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 pb-24">
              <SummaryEditor summary={project.summary} onChange={draft.setSummary} clientName={client.name} />
              <div className="mt-6 flex justify-end">
                <GlassButton tone="blue" onClick={() => setStep("publish")} disabled={!summaryOk || !segments.length}>
                  Review & publish
                </GlassButton>
              </div>
            </div>
          </div>
        ) : (
          <PublishStep
            client={client}
            project={project}
            total={total}
            render={render}
            onRender={prepareFinal}
            publish={publish}
            onPublish={doPublish}
            summaryOk={summaryOk}
            onWrite={() => setStep("write")}
            onRecord={() => setStep("record")}
            onClose={onClose}
            existing={existing}
          />
        )}

        {/* Footer: discard + save state (phones) */}
        {ready && publish.status !== "done" && (
          <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 pb-safe border-t border-white/[0.07]">
            <p className="lg:hidden flex items-center gap-1.5 text-white/45 text-[11px] truncate">
              <HardDrive size={12} /> {saveLabel}
            </p>
            <button
              type="button"
              onClick={() => setConfirmDiscard(true)}
              disabled={recActive || publish.status === "publishing" || (!segments.length && !summaryOk)}
              className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-white/55 disabled:opacity-30"
            >
              <Trash2 size={13} /> Discard draft
            </button>
          </div>
        )}

        {confirmDiscard && (
          <div className="absolute inset-0 z-10 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={() => setConfirmDiscard(false)}>
            <div className="w-full max-w-sm rounded-2xl p-5" style={{ ...GLASS, background: "rgba(16,16,18,0.92)" }} onClick={(e) => e.stopPropagation()} role="alertdialog" aria-label="Discard this draft?">
              <p className="text-white font-semibold">Discard this draft?</p>
              <p className="text-white/60 text-sm mt-1.5">Every recording, edit and the written overview are deleted from this device. Nothing was uploaded.</p>
              <div className="mt-5 flex gap-2 justify-end">
                <GlassButton onClick={() => setConfirmDiscard(false)}>Keep</GlassButton>
                <button
                  type="button"
                  onClick={async () => {
                    setConfirmDiscard(false);
                    await draft.discard();
                    setSelectedId(null);
                    setPlayhead(0);
                    setReplaceTarget(null);
                    setStep("record");
                    showToast?.("Draft discarded");
                  }}
                  className="h-9 px-3.5 rounded-xl text-xs font-bold text-white"
                  style={{ background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.55)" }}
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </CoachGlass>
  );
  return createPortal(page, document.body);
}

function StepTabs({ step, setStep, locked, hasClips }) {
  return (
    <div className="flex gap-1 p-1 rounded-xl w-full md:w-auto" style={GLASS} role="tablist" aria-label="Steps">
      {STEPS.map((s, i) => {
        const disabled = (locked && s.id !== step) || (!hasClips && (s.id === "edit" || s.id === "publish"));
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={step === s.id}
            disabled={disabled}
            onClick={() => setStep(s.id)}
            className={`flex-1 md:flex-none h-8 px-3 md:px-4 rounded-lg text-xs font-bold tracking-[0.04em] transition-colors disabled:opacity-35 ${step === s.id ? "bg-white text-black" : "text-white/75"}`}
          >
            <span className="tabular-nums mr-1.5 opacity-50">{i + 1}</span>
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function ProgressLine({ value }) {
  return (
    <div className="h-1 rounded-full bg-white/10 overflow-hidden">
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, backgroundColor: MEASURE_BLUE }} />
    </div>
  );
}

function PublishStep({ client, project, total, render, onRender, publish, onPublish, summaryOk, onWrite, onRecord, onClose, existing }) {
  const first = client.name?.split(" ")[0] || "your client";
  if (publish.status === "done") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6" data-testid="publish-done">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-5" style={GLASS_BLUE}>
          <Check size={28} className="text-white" />
        </div>
        <p className="text-white text-2xl font-semibold">{existing ? "Feedback updated" : `Sent to ${first}`}</p>
        <p className="text-white/55 text-sm mt-2 max-w-sm">They've been notified and can watch it in their Check-ins. The recordings have been cleared from this device.</p>
        <GlassButton tone="blue" className="mt-6" onClick={onClose}>
          Done
        </GlassButton>
      </div>
    );
  }
  const stageLabel = { render: "Putting the video together on this device", upload: "Uploading the finished video", save: "Saving the feedback", done: "Done" }[publish.stage] || "";
  const publishing = publish.status === "publishing";
  const canPublish = summaryOk && project.segments.length > 0 && !publishing;
  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" data-testid="publish-step">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 pb-24 grid lg:grid-cols-[minmax(0,1fr)_320px] gap-8">
        <div>
          <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-white/50 mb-3">Exactly what {first} will see</p>
          <div className="rounded-[22px] p-3 md:p-5" style={{ background: "#000" }}>
            {render.status === "ready" ? (
              <CinematicVideoPlayer src={render.url} poster={render.posterUrl} width={project.render?.width} height={project.render?.height} duration={total} maxHeight="60vh" />
            ) : (
              <div className="aspect-video rounded-[18px] flex flex-col items-center justify-center gap-3 text-center px-6" style={{ background: "#0b0b0c" }}>
                {render.status === "error" ? (
                  <>
                    <AlertTriangle size={20} className="text-white/70" />
                    <p className="text-white text-sm max-w-xs">{render.error}</p>
                    <GlassButton tone="blue" onClick={onRender}>
                      <RotateCcw size={13} /> Try again
                    </GlassButton>
                  </>
                ) : (
                  <>
                    <Loader2 size={20} className="text-white/70 animate-spin" />
                    <p className="text-white/80 text-sm">Putting your {project.segments.length} clip{project.segments.length === 1 ? "" : "s"} together on this device…</p>
                    <div className="w-48">
                      <ProgressLine value={render.progress} />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="mt-5 rounded-2xl bg-white px-5 py-5 text-black">
            {summaryOk ? <VideoFeedbackSummary summary={project.summary} /> : <p className="text-black/40 text-sm">No written overview yet.</p>}
          </div>
        </div>
        <div className="lg:sticky lg:top-6 self-start space-y-5">
          <div className="divide-y divide-white/[0.08]">
            <Row ok={project.segments.length > 0} label="Video" value={project.segments.length ? `${formatClock(total)} · ${project.segments.length} clip${project.segments.length === 1 ? "" : "s"}` : "Not recorded"} action={!project.segments.length ? { label: "Record", onClick: onRecord } : null} />
            <Row ok={summaryOk} label="Written overview" value={summaryOk ? "Ready" : "Overall note missing"} action={{ label: summaryOk ? "Edit" : "Write", onClick: onWrite }} />
            <Row ok label="Check-in" value={project.checkInDate ? fmtDay(project.checkInDate) : "Weekly feedback"} />
            {render.status === "ready" && project.render?.size ? <Row ok label="File" value={`${(project.render.size / 1024 / 1024).toFixed(1)} MB · ${project.render.width}×${project.render.height}`} /> : null}
          </div>
          <p className="text-white/45 text-xs leading-relaxed">
            Nothing has left this device yet. Publishing uploads only the finished video, saves the overview and notifies {first}.
          </p>
          {publishing && (
            <div className="space-y-2" data-testid="publish-progress">
              <p className="text-white text-sm">{stageLabel}…</p>
              <ProgressLine value={publish.stage === "save" ? 1 : publish.progress} />
            </div>
          )}
          {publish.status === "error" && (
            <div className="rounded-xl px-3.5 py-3 text-sm text-white" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)" }} data-testid="publish-error">
              {publish.error}
              <p className="text-white/60 text-xs mt-1">Your video is still on this device — publishing again picks up where it stopped.</p>
            </div>
          )}
          <button
            type="button"
            onClick={onPublish}
            disabled={!canPublish}
            data-testid="publish-button"
            className="w-full h-12 rounded-2xl text-white text-sm font-bold tracking-[0.06em] flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.99] transition-transform"
            style={GLASS_BLUE}
          >
            {publishing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {publishing ? "PUBLISHING…" : publish.status === "error" ? "RETRY PUBLISH" : existing ? "PUBLISH NEW VERSION" : "PUBLISH FEEDBACK"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ ok, label, value, action }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: ok ? "rgba(47,143,255,0.18)" : "rgba(255,255,255,0.06)" }}>
        {ok ? <Check size={12} style={{ color: MEASURE_BLUE }} /> : <Video size={11} className="text-white/40" />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-white/50 text-[11px]">{label}</p>
        <p className="text-white text-sm truncate">{value}</p>
      </div>
      {action && (
        <button type="button" onClick={action.onClick} className="text-xs font-semibold" style={{ color: MEASURE_BLUE }}>
          {action.label}
        </button>
      )}
    </div>
  );
}
