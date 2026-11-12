// Coach video feedback (#219): the edit timeline and its preview.
//
// TimelinePreview plays the clips back to back from the recordings on this
// device (no render, no upload) with one seek bar over the whole video.
// EditTimeline shows the clips in order: tap to select, drag sideways to
// rearrange, and the selected clip gets a trim bar with two draggable
// handles over its whole recording. Split, delete, re-record, undo/redo sit
// in one row under it.
import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { Play, Pause, Scissors, Trash2, Undo2, Redo2, Video, ChevronLeft, ChevronRight, Film } from "lucide-react";
import { MEASURE_BLUE } from "../../theme";
import { formatClock, locate, segmentLength, segmentStart, totalDuration, MIN_SEGMENT_SEC } from "../../lib/videoFeedback/timeline";

// --- preview -----------------------------------------------------------
export const TimelinePreview = forwardRef(function TimelinePreview({ segments, getSourceUrl, playhead, onPlayhead, onPlayingChange, mirror = false }, ref) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const stateRef = useRef({ index: -1, sourceId: null, playing: false, playhead });
  const total = totalDuration(segments);
  stateRef.current.playhead = playhead;

  const loadAt = useCallback(
    async (t, { autoplay = false } = {}) => {
      const v = videoRef.current;
      const loc = locate(segments, Math.max(0, Math.min(t, Math.max(0, total - 0.01))));
      if (!v || !loc) return;
      stateRef.current.index = loc.index;
      if (stateRef.current.sourceId !== loc.segment.sourceId) {
        const url = await getSourceUrl(loc.segment.sourceId);
        if (!url) return;
        stateRef.current.sourceId = loc.segment.sourceId;
        v.src = url;
        await new Promise((resolve) => {
          if (v.readyState >= 1) return resolve();
          v.addEventListener("loadedmetadata", resolve, { once: true });
          v.addEventListener("error", resolve, { once: true });
        });
      }
      try {
        v.currentTime = loc.sourceTime;
      } catch {}
      if (autoplay) {
        try {
          await v.play();
        } catch {
          setPlaying(false);
          stateRef.current.playing = false;
        }
      }
    },
    [segments, total, getSourceUrl]
  );

  // Show the frame under the playhead when paused and something changed.
  useEffect(() => {
    if (!stateRef.current.playing) loadAt(playhead);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments]);

  const play = useCallback(async () => {
    if (!segments.length) return;
    const start = playhead >= total - 0.05 ? 0 : playhead;
    stateRef.current.playing = true;
    setPlaying(true);
    onPlayingChange?.(true);
    await loadAt(start, { autoplay: true });
  }, [segments, playhead, total, loadAt, onPlayingChange]);

  const pause = useCallback(() => {
    stateRef.current.playing = false;
    setPlaying(false);
    onPlayingChange?.(false);
    videoRef.current?.pause();
  }, [onPlayingChange]);

  const seek = useCallback(
    (t) => {
      onPlayhead(Math.max(0, Math.min(total, t)));
      loadAt(t, { autoplay: stateRef.current.playing });
    },
    [onPlayhead, total, loadAt]
  );

  // Used by the trim handles: show exactly the frame being trimmed to.
  const showSourceTime = useCallback(async (sourceId, time) => {
    const v = videoRef.current;
    if (!v) return;
    if (stateRef.current.playing) pause();
    if (stateRef.current.sourceId !== sourceId) {
      const url = await getSourceUrl(sourceId);
      if (!url) return;
      stateRef.current.sourceId = sourceId;
      v.src = url;
      await new Promise((r) => (v.readyState >= 1 ? r() : v.addEventListener("loadedmetadata", r, { once: true })));
    }
    try {
      v.currentTime = time;
    } catch {}
  }, [getSourceUrl, pause]);

  useImperativeHandle(ref, () => ({ play, pause, seek, showSourceTime }), [play, pause, seek, showSourceTime]);

  function onTimeUpdate() {
    const v = videoRef.current;
    const st = stateRef.current;
    if (!v || !st.playing || st.index < 0) return;
    const seg = segments[st.index];
    if (!seg) return;
    const start = segmentStart(segments, seg.id) ?? 0;
    const t = start + Math.max(0, v.currentTime - seg.in);
    if (v.currentTime >= seg.out - 0.02) {
      const nextIndex = st.index + 1;
      if (nextIndex >= segments.length) {
        pause();
        onPlayhead(total);
        return;
      }
      const nextStart = segmentStart(segments, segments[nextIndex].id);
      onPlayhead(nextStart);
      loadAt(nextStart + 0.001, { autoplay: true });
      return;
    }
    onPlayhead(Math.min(total, t));
  }

  return (
    <div className="absolute inset-0 bg-black flex flex-col">
      <div className="relative flex-1 min-h-0">
        <video
          ref={videoRef}
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-contain"
          style={mirror ? { transform: "scaleX(-1)" } : undefined}
          onTimeUpdate={onTimeUpdate}
          onEnded={onTimeUpdate}
          data-testid="timeline-preview-video"
        />
        {segments.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 text-sm gap-2">
            <Film size={22} />
            Nothing recorded yet
          </div>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-3 px-3 py-2.5" style={{ background: "rgba(0,0,0,0.6)" }}>
        <button type="button" onClick={playing ? pause : play} disabled={!segments.length} className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center shrink-0 disabled:opacity-30" aria-label={playing ? "Pause preview" : "Play preview"}>
          {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
        </button>
        <span className="text-white/80 text-[11px] font-semibold tabular-nums">{formatClock(playhead)}</span>
        <input
          type="range"
          aria-label="Preview position"
          min={0}
          max={total || 0}
          step={0.05}
          value={Math.min(playhead, total)}
          onChange={(e) => seek(Number(e.target.value))}
          className="flex-1 accent-white"
          disabled={!segments.length}
        />
        <span className="text-white/50 text-[11px] font-semibold tabular-nums">{formatClock(total)}</span>
      </div>
    </div>
  );
});

// --- clip strip --------------------------------------------------------
function useThumb(segment, getSourceUrl) {
  const [thumb, setThumb] = useState(null);
  useEffect(() => {
    let cancelled = false;
    let video;
    (async () => {
      const url = await getSourceUrl(segment.sourceId);
      if (!url || cancelled) return;
      video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.src = url;
      await new Promise((r) => {
        video.addEventListener("loadeddata", r, { once: true });
        video.addEventListener("error", r, { once: true });
      });
      if (cancelled) return;
      try {
        video.currentTime = segment.in + Math.min(0.5, (segment.out - segment.in) / 2);
        await new Promise((r) => {
          video.addEventListener("seeked", r, { once: true });
          video.addEventListener("error", r, { once: true });
        });
        const c = document.createElement("canvas");
        const w = 160;
        const h = Math.round((w * (video.videoHeight || 9)) / (video.videoWidth || 16));
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(video, 0, 0, w, h);
        if (!cancelled) setThumb(c.toDataURL("image/jpeg", 0.7));
      } catch {}
    })();
    return () => {
      cancelled = true;
      if (video) video.removeAttribute("src");
    };
  }, [segment.sourceId, segment.in, segment.out, getSourceUrl]);
  return thumb;
}

function Clip({ seg, index, selected, onSelect, onDragStart, getSourceUrl, widthPx, dragging }) {
  const thumb = useThumb(seg, getSourceUrl);
  return (
    <button
      type="button"
      data-testid={`timeline-clip-${index}`}
      onPointerDown={(e) => onDragStart(e, index)}
      onClick={() => onSelect(seg.id)}
      className="relative shrink-0 h-14 rounded-lg overflow-hidden text-left touch-pan-y transition-[opacity,transform]"
      style={{
        width: widthPx,
        border: selected ? `2px solid ${MEASURE_BLUE}` : "1px solid rgba(255,255,255,0.14)",
        opacity: dragging ? 0.5 : 1,
        background: "#111",
        boxShadow: selected ? "0 0 14px rgba(47,143,255,0.35)" : undefined,
      }}
      aria-pressed={selected}
      aria-label={`Clip ${index + 1}, ${formatClock(segmentLength(seg))}`}
    >
      {thumb && <img src={thumb} alt="" className="absolute inset-0 w-full h-full object-cover opacity-80" draggable={false} />}
      <span className="absolute left-1.5 top-1 text-[10px] font-bold text-white drop-shadow">{index + 1}</span>
      <span className="absolute right-1.5 bottom-1 text-[10px] font-semibold text-white tabular-nums px-1 rounded bg-black/55">{formatClock(segmentLength(seg))}</span>
    </button>
  );
}

// Trim bar for the selected clip: its whole recording, with the kept window
// between two handles.
function TrimBar({ seg, source, onTrim, onTrimEnd, onPreviewTime }) {
  const barRef = useRef(null);
  const dragRef = useRef(null);
  const dur = source?.duration || seg.out;
  const pct = (t) => `${(t / dur) * 100}%`;

  function timeAt(clientX) {
    const rect = barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(dur, ((clientX - rect.left) / rect.width) * dur));
  }
  function start(e, which) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = which;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  }
  function move(e) {
    if (!dragRef.current) return;
    const t = timeAt(e.clientX);
    if (dragRef.current === "in") {
      const v = Math.min(t, seg.out - MIN_SEGMENT_SEC);
      onTrim({ in: v });
      onPreviewTime(v);
    } else {
      const v = Math.max(t, seg.in + MIN_SEGMENT_SEC);
      onTrim({ out: v });
      onPreviewTime(v);
    }
  }
  function end(e) {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    onTrimEnd();
  }

  return (
    <div className="px-1">
      <div ref={barRef} className="relative h-10 rounded-lg bg-white/[0.06] select-none" data-testid="trim-bar">
        <div className="absolute inset-y-0 left-0 rounded-l-lg bg-black/60" style={{ width: pct(seg.in) }} />
        <div className="absolute inset-y-0 right-0 rounded-r-lg bg-black/60" style={{ width: `${100 - (seg.out / dur) * 100}%` }} />
        <div className="absolute inset-y-0 border-y-2" style={{ left: pct(seg.in), right: `${100 - (seg.out / dur) * 100}%`, borderColor: MEASURE_BLUE, background: "rgba(47,143,255,0.10)" }} />
        {[
          ["in", seg.in],
          ["out", seg.out],
        ].map(([which, t]) => (
          <div
            key={which}
            role="slider"
            aria-label={which === "in" ? "Trim start" : "Trim end"}
            aria-valuemin={0}
            aria-valuemax={dur}
            aria-valuenow={t}
            tabIndex={0}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 1 : 0.1;
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                const d = e.key === "ArrowLeft" ? -step : step;
                onTrim(which === "in" ? { in: seg.in + d } : { out: seg.out + d });
                onTrimEnd();
              }
            }}
            onPointerDown={(e) => start(e, which)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            className="absolute top-0 bottom-0 w-6 -ml-3 flex items-center justify-center cursor-ew-resize touch-none"
            style={{ left: pct(t) }}
            data-testid={`trim-${which}`}
          >
            <span className="w-2.5 h-full rounded-md" style={{ background: MEASURE_BLUE, boxShadow: "0 0 10px rgba(47,143,255,0.6)" }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-white/50 mt-1 tabular-nums">
        <span>Start {formatClock(seg.in)}</span>
        <span>Keeps {formatClock(segmentLength(seg))}</span>
        <span>End {formatClock(seg.out)}</span>
      </div>
    </div>
  );
}

function ToolButton({ icon: Icon, label, onClick, disabled, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-1 min-w-[54px] h-12 px-1.5 rounded-xl text-[10px] font-semibold disabled:opacity-30 active:scale-95 transition-transform"
      style={{ color: tone === "danger" ? "#F87171" : "rgba(255,255,255,0.85)" }}
    >
      <Icon size={17} />
      {label}
    </button>
  );
}

export default function EditTimeline({
  trailing = null,
  segments,
  sources,
  selectedId,
  onSelect,
  playhead,
  onSeek,
  getSourceUrl,
  onTrimLive,
  onTrimCommit,
  onSplit,
  onDelete,
  onMove,
  onReRecord,
  onAddRecording,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onPreviewSourceTime,
  compact = false,
}) {
  const total = totalDuration(segments);
  const stripRef = useRef(null);
  const [dragIndex, setDragIndex] = useState(null);
  const dragRef = useRef(null);
  const selected = segments.find((s) => s.id === selectedId) || null;
  const selectedIndex = selected ? segments.indexOf(selected) : -1;
  const pxPerSec = 14;
  const widthFor = (s) => Math.max(64, Math.min(260, segmentLength(s) * pxPerSec));

  // Pointer drag to rearrange (works with touch; a tap still selects).
  function onDragStart(e, index) {
    dragRef.current = { index, x: e.clientX, started: false, pointerId: e.pointerId };
    const moveHandler = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.started && Math.abs(ev.clientX - d.x) > 10) {
        d.started = true;
        setDragIndex(d.index);
      }
    };
    const upHandler = (ev) => {
      const d = dragRef.current;
      window.removeEventListener("pointermove", moveHandler);
      window.removeEventListener("pointerup", upHandler);
      window.removeEventListener("pointercancel", upHandler);
      dragRef.current = null;
      setDragIndex(null);
      if (!d?.started || !stripRef.current) return;
      const clips = [...stripRef.current.querySelectorAll("[data-testid^='timeline-clip-']")];
      let target = clips.length - 1;
      for (let i = 0; i < clips.length; i++) {
        const r = clips[i].getBoundingClientRect();
        if (ev.clientX < r.left + r.width / 2) {
          target = i > d.index ? i - 1 : i;
          break;
        }
      }
      if (target !== d.index) onMove(d.index, target);
    };
    window.addEventListener("pointermove", moveHandler);
    window.addEventListener("pointerup", upHandler);
    window.addEventListener("pointercancel", upHandler);
  }

  const locPlayhead = locate(segments, playhead);
  const canSplit = !!locPlayhead && locPlayhead.offset >= MIN_SEGMENT_SEC && segmentLength(locPlayhead.segment) - locPlayhead.offset >= MIN_SEGMENT_SEC;

  return (
    <div className="space-y-2.5" data-testid="edit-timeline">
      <div className="flex items-center justify-between px-1">
        <p className="text-white/50 text-[10px] font-bold tracking-[0.14em] uppercase">
          {segments.length} clip{segments.length === 1 ? "" : "s"} · {formatClock(total)}
        </p>
        {!compact && <p className="text-white/35 text-[10px]">Tap a clip to trim · drag to reorder</p>}
        {trailing}
      </div>
      <div ref={stripRef} className="relative flex gap-1.5 overflow-x-auto no-scrollbar pb-1 px-1">
        {segments.map((s, i) => (
          <Clip key={s.id} seg={s} index={i} selected={s.id === selectedId} onSelect={onSelect} onDragStart={onDragStart} getSourceUrl={getSourceUrl} widthPx={widthFor(s)} dragging={dragIndex === i} />
        ))}
        <button
          type="button"
          onClick={onAddRecording}
          className="shrink-0 h-14 w-16 rounded-lg flex flex-col items-center justify-center gap-0.5 text-white/70 text-[10px] font-semibold border border-dashed border-white/20"
          aria-label="Record another clip"
        >
          <Video size={16} />
          Add
        </button>
      </div>
      {total > 0 && !compact && (
        <input
          type="range"
          aria-label="Timeline position"
          min={0}
          max={total}
          step={0.05}
          value={Math.min(playhead, total)}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="w-full accent-[#2F8FFF] px-1"
        />
      )}
      {!compact && selected && (
        <TrimBar
          seg={selected}
          source={sources[selected.sourceId]}
          onTrim={(patch) => onTrimLive(selected.id, patch)}
          onTrimEnd={() => onTrimCommit(selected.id)}
          onPreviewTime={(t) => onPreviewSourceTime(selected.sourceId, t)}
        />
      )}
      {!compact && (
        <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
          <ToolButton icon={Scissors} label="Split" onClick={onSplit} disabled={!canSplit} />
          <ToolButton icon={ChevronLeft} label="Earlier" onClick={() => onMove(selectedIndex, selectedIndex - 1)} disabled={selectedIndex <= 0} />
          <ToolButton icon={ChevronRight} label="Later" onClick={() => onMove(selectedIndex, selectedIndex + 1)} disabled={selectedIndex < 0 || selectedIndex >= segments.length - 1} />
          <ToolButton icon={Video} label="Re-record" onClick={() => onReRecord(selected?.id)} disabled={!selected} />
          <ToolButton icon={Trash2} label="Delete" onClick={() => onDelete(selected?.id)} disabled={!selected} tone="danger" />
          <span className="w-px h-8 bg-white/10 mx-1 shrink-0" />
          <ToolButton icon={Undo2} label="Undo" onClick={onUndo} disabled={!canUndo} />
          <ToolButton icon={Redo2} label="Redo" onClick={onRedo} disabled={!canRedo} />
        </div>
      )}
    </div>
  );
}
