// Coach video feedback (#219): the "Video Feedback" section at the top of a
// client's Check-ins tab — the Record Video Feedback action, an unpublished
// draft on this device, and every published video (watch, edit the
// overview, replace the video, delete). The recording workspace itself is
// loaded only when opened.
import React, { Suspense, useEffect, useState } from "react";
import { Video, Play, Pencil, RefreshCw, Trash2, Eye, EyeOff, Loader2 } from "lucide-react";
import { useApp } from "../../lib/AppContext";
import { DarkPanel, GlassButton, GLASS } from "../darkUI";
import { BottomSheet } from "../../components/ui";
import { MEASURE_BLUE, CLIENT_DARK_BORDER } from "../../theme";
import { loadProject } from "../../lib/videoFeedback/localStore";
import { formatClock, summaryReady, emptySummary, cleanSummary } from "../../lib/videoFeedback/timeline";
import { deleteStoragePath } from "../../lib/storage";
import CinematicVideoPlayer from "../../components/CinematicVideoPlayer";
import VideoFeedbackSummary from "../../components/VideoFeedbackSummary";
import SummaryEditor from "./SummaryEditor";

const EMPTY_LIST = [];

// #221: a new video answers the client's NEWEST check-in, and only while it
// has no video yet. Once it's answered, the next video is plain weekly
// feedback — never silently linked to an older check-in.
export function checkInToAnswer(responses, feedback) {
  const newest = (responses || []).slice().sort((a, b) => b.date - a.date)[0];
  if (!newest) return null;
  return (feedback || []).some((f) => f.checkInId === newest.id) ? null : newest;
}
const VideoFeedbackWorkspace = React.lazy(() => import("./VideoFeedbackWorkspace"));

const fmtDay = (ts) => new Date(ts).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

export default function CoachFeedbackPanel({ client, showToast, workspace, setWorkspace }) {
  const { db, currentUser, updateVideoFeedbackSummary, deleteVideoFeedback } = useApp();
  const feedback = db.videoFeedback?.[client.id] || EMPTY_LIST;
  const responses = db.formResponses?.[client.id] || EMPTY_LIST;
  const [draftInfo, setDraftInfo] = useState(null);
  const [watching, setWatching] = useState(null);
  const [editing, setEditing] = useState(null); // { id, summary }
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  // An unpublished draft on this device for this client?
  useEffect(() => {
    let cancelled = false;
    if (workspace) return undefined;
    loadProject(currentUser?.id, client.id)
      .then((p) => !cancelled && setDraftInfo(p && (p.segments?.length || Object.keys(p.pendingTakes || {}).length || summaryReady(p.summary)) ? p : null))
      .catch(() => !cancelled && setDraftInfo(null));
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, client.id, workspace]);

  const latestUnanswered = checkInToAnswer(responses, feedback);

  function openNew() {
    setWorkspace({ checkInId: latestUnanswered?.id || null, checkInDate: latestUnanswered?.date || null, existing: null });
  }

  return (
    <>
      <DarkPanel className="p-4 md:p-5">
        <div className="relative flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(47,143,255,0.12)" }}>
              <Video size={15} style={{ color: MEASURE_BLUE }} />
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm">Video Feedback</p>
              <p className="text-white/50 text-[11px] truncate">
                {draftInfo ? `Unpublished draft on this device · ${formatClock((draftInfo.segments || []).reduce((a, s) => a + (s.out - s.in), 0))}` : latestUnanswered ? `Answers the check-in from ${fmtDay(latestUnanswered.date)}` : "Weekly video + written overview"}
              </p>
            </div>
          </div>
          <GlassButton tone="blue" onClick={openNew} data-testid="record-video-feedback">
            <Video size={13} /> {draftInfo ? "Continue draft" : "Record Video Feedback"}
          </GlassButton>
        </div>

        {feedback.length === 0 ? (
          <div className="relative border border-dashed rounded-xl py-7 text-center" style={{ borderColor: CLIENT_DARK_BORDER }}>
            <p className="text-white/70 text-sm">No video feedback sent yet.</p>
          </div>
        ) : (
          <div className="relative divide-y divide-white/[0.07]">
            {feedback.map((f) => (
              <div key={f.id} className="flex items-center gap-3 py-3" data-testid="published-feedback-row">
                <button type="button" onClick={() => setWatching(f)} className="relative w-20 h-12 rounded-lg overflow-hidden bg-black shrink-0" aria-label="Watch">
                  {f.posterUrl && <img src={f.posterUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center" style={GLASS}>
                      <Play size={11} fill="white" color="white" className="ml-0.5" />
                    </span>
                  </span>
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{f.checkInDate ? `Check-in ${fmtDay(f.checkInDate)}` : "Weekly feedback"}</p>
                  <p className="text-white/50 text-[11px] flex items-center gap-1.5">
                    {fmtDay(f.publishedAt)} · {formatClock(f.duration)} ·{" "}
                    {f.viewedAt ? (
                      <>
                        <Eye size={11} /> Watched
                      </>
                    ) : (
                      <>
                        <EyeOff size={11} /> Not watched yet
                      </>
                    )}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => setEditing({ id: f.id, summary: { ...emptySummary(), ...f.summary, priorities: [...(f.summary?.priorities || []), ""].slice(0, 5) } })} className="w-8 h-8 flex items-center justify-center text-white/70" aria-label="Edit written overview">
                    <Pencil size={14} />
                  </button>
                  <button type="button" onClick={() => setWorkspace({ checkInId: f.checkInId, checkInDate: f.checkInDate, existing: f })} className="w-8 h-8 flex items-center justify-center text-white/70" aria-label="Replace video">
                    <RefreshCw size={14} />
                  </button>
                  <button type="button" onClick={() => setDeleting(f)} className="w-8 h-8 flex items-center justify-center text-white/50" aria-label="Delete feedback">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DarkPanel>

      {workspace && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 text-white/70 text-sm gap-2" data-apex-loading>
              <Loader2 size={16} className="animate-spin" /> Opening…
            </div>
          }
        >
          <VideoFeedbackWorkspace
            client={client}
            checkInId={workspace.checkInId}
            checkInDate={workspace.checkInDate}
            existing={workspace.existing}
            showToast={showToast}
            onClose={() => setWorkspace(null)}
          />
        </Suspense>
      )}

      <BottomSheet open={!!watching} onClose={() => setWatching(null)} title="Video feedback" dark wide>
        {watching && (
          <div className="space-y-5">
            <CinematicVideoPlayer src={watching.videoUrl} poster={watching.posterUrl} width={watching.width} height={watching.height} duration={watching.duration} maxHeight="60vh" />
            <div className="rounded-[22px] px-5 py-5" style={{ background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.11)" }}>
              <VideoFeedbackSummary summary={watching.summary} onDarkStage />
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={!!editing} onClose={() => !busy && setEditing(null)} title="Edit written overview" dark wide>
        {editing && (
          <div>
            <SummaryEditor summary={editing.summary} onChange={(summary) => setEditing({ ...editing, summary })} clientName={client.name} showPreview={false} />
            <GlassButton
              tone="blue"
              className="w-full mt-4 h-11"
              disabled={busy || !summaryReady(editing.summary)}
              onClick={async () => {
                setBusy(true);
                try {
                  await updateVideoFeedbackSummary(editing.id, cleanSummary(editing.summary));
                  showToast?.("Overview updated");
                  setEditing(null);
                } catch (err) {
                  showToast?.(err.message, true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "SAVING…" : "SAVE OVERVIEW"}
            </GlassButton>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={!!deleting} onClose={() => !busy && setDeleting(null)} title="Delete this feedback?" dark>
        {deleting && (
          <div>
            <p className="text-white/70 text-sm">The video and overview from {fmtDay(deleting.publishedAt)} are removed for {client.name?.split(" ")[0] || "the client"} too. This can't be undone.</p>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await deleteVideoFeedback(deleting.id);
                  deleteStoragePath(deleting.videoPath);
                  deleteStoragePath(deleting.posterPath);
                  showToast?.("Feedback deleted");
                  setDeleting(null);
                } catch (err) {
                  showToast?.(err.message, true);
                } finally {
                  setBusy(false);
                }
              }}
              className="w-full mt-5 h-11 rounded-xl text-white text-xs font-bold tracking-[0.06em] disabled:opacity-40"
              style={{ background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.55)" }}
            >
              {busy ? "DELETING…" : "DELETE FEEDBACK"}
            </button>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
