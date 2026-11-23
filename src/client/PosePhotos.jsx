// #325 (owner, 2026-11-24): the coached client adds progress photos as
// Front / Side / Back — three clear buttons, a full-screen guide for each pose
// (a framed outline of how to stand, four steps, the conditions that make
// photos comparable), Take Photo / Choose from Library, and the pose saved on
// the photo (`pose`, the same field the coach tags in #324). Then the client
// sees their own change per pose: first vs latest, days and kg between, every
// figure from their own photos and weigh-ins. Coached client only — Train Solo
// keeps its own photos section unchanged.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ChevronLeft, Check, Image as ImageIcon, Plus, X } from "lucide-react";
import { Card, BottomSheet, DangerButton } from "../components/ui";
import { MEASURE_BLUE } from "../theme";
import { closestWeighIn } from "../lib/trainingStats";
import { localDateKey } from "../lib/dateKey";
import { POSES, POSE_LABEL, POSE_GUIDE, PHOTO_CONDITIONS, sortPhotos, firstAndLatest, comparisonFigures } from "../lib/progressPhotos";
import { clientLook } from "./clientLook";

const shortDate = (ms) => new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
const longDate = (ms) => new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

// A simple outline of how to stand for each pose, drawn in the ink colour.
export function PoseFigure({ pose, color, className = "", strokeWidth = 1.6 }) {
  const front =
    "M53 43 L67 43 L69 50 L86 55 Q93 57 93 66 L95 118 L89 118 L85 72 L81 72 L81 121 L79 206 L67 206 L61.5 132 L58.5 132 L53 206 L41 206 L39 121 L39 72 L35 72 L31 118 L25 118 L27 66 Q27 57 34 55 L51 50 Z";
  const side =
    "M57 43 L66 43 L68 51 Q77 57 75 74 L73 116 Q73 126 69 131 L71 206 L58 206 L56 133 Q47 125 49 112 L50 72 Q48 57 57 52 Z";
  return (
    <svg viewBox="0 0 120 220" className={className} aria-hidden="true" fill="none">
      {pose === "side" ? (
        <>
          <circle cx="63" cy="27" r="14" stroke={color} strokeWidth={strokeWidth} />
          <path d={side} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" fill={color} fillOpacity="0.06" />
          <path d="M61 60 L59 116 L65 116 L67 62" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
          <path d="M77 27 L83 27" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="60" cy="27" r="14" stroke={color} strokeWidth={strokeWidth} />
          <path d={front} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" fill={color} fillOpacity="0.06" />
          {pose === "back" ? (
            <path d="M60 52 L60 118 M47 62 Q52 74 58 70 M73 62 Q68 74 62 70" stroke={color} strokeWidth={strokeWidth * 0.8} strokeLinecap="round" opacity="0.7" />
          ) : null}
        </>
      )}
    </svg>
  );
}

// The framed "viewfinder": corner marks, head and feet lines, the outline.
function Viewfinder({ pose, L }) {
  const corner = (pos) => (
    <span
      key={pos}
      className="absolute w-6 h-6"
      style={{
        [pos.includes("t") ? "top" : "bottom"]: 12,
        [pos.includes("l") ? "left" : "right"]: 12,
        borderColor: L.ink,
        borderStyle: "solid",
        borderWidth: 0,
        [pos.includes("t") ? "borderTopWidth" : "borderBottomWidth"]: 2,
        [pos.includes("l") ? "borderLeftWidth" : "borderRightWidth"]: 2,
        [`border${pos.includes("t") ? "Top" : "Bottom"}${pos.includes("l") ? "Left" : "Right"}Radius`]: 8,
      }}
    />
  );
  const guide = (top, label) => (
    <div className="absolute inset-x-6 flex items-center gap-2" style={{ top }}>
      <span className="flex-1 border-t border-dashed" style={{ borderColor: L.faint }} />
      <span className="text-[9px] font-bold tracking-[0.18em]" style={{ color: L.faint }}>
        {label}
      </span>
    </div>
  );
  return (
    <div className="relative rounded-[26px] overflow-hidden" style={{ ...L.card, height: "min(36vh, 300px)" }} data-testid="pose-viewfinder">
      {["tl", "tr", "bl", "br"].map(corner)}
      {guide("11%", "HEAD")}
      {guide("89%", "FEET")}
      <div className="absolute inset-0 flex items-center justify-center py-[9%]">
        <PoseFigure pose={pose} color={L.ink} className="h-full" />
      </div>
      <span className="absolute left-1/2 -translate-x-1/2 bottom-2 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: MEASURE_BLUE }} />
    </div>
  );
}

// Full-screen guide for one pose; after a photo is added it moves on to the
// next pose not done yet, and closes once all three are in.
export function PosePhotoGuide({ open, pose: startPose, dark, onClose, onAdd, busy, hideDate = false }) {
  const L = clientLook(dark);
  const [pose, setPose] = useState(startPose || "front");
  const [dateKey, setDateKey] = useState(() => localDateKey());
  const [done, setDone] = useState([]);
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);

  useEffect(() => {
    if (open) {
      setPose(startPose || "front");
      setDateKey(localDateKey());
      setDone([]);
    }
  }, [open, startPose]);

  if (!open || typeof document === "undefined") return null;
  const guide = POSE_GUIDE[pose];
  const index = POSES.findIndex(([id]) => id === pose);

  const picked = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    onAdd(files, dateKey, pose);
    const nowDone = [...new Set([...done, pose])];
    setDone(nowDone);
    const next = POSES.find(([id]) => !nowDone.includes(id));
    if (next) setPose(next[0]);
    else onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[115] flex flex-col overflow-y-auto overscroll-contain"
      style={{ backgroundColor: L.page, backgroundImage: L.pageImage, color: L.ink }}
      data-testid="pose-guide"
      role="dialog"
      aria-label={`Add ${guide.title} photo`}
    >
      <div className="shrink-0 flex items-center justify-between px-3 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-1">
        <button type="button" onClick={onClose} aria-label="Back" className="w-10 h-10 -ml-1 flex items-center justify-center" style={{ color: L.ink }}>
          <ChevronLeft size={24} />
        </button>
        <p className="text-[10.5px] font-bold tracking-[0.2em]" style={{ color: L.muted }}>
          PROGRESS PHOTO · {index + 1} OF 3
        </p>
        <button type="button" onClick={onClose} className="h-10 px-2 text-[13px] font-semibold" style={{ color: done.length ? L.ink : L.faint }}>
          {done.length ? "Done" : "Close"}
        </button>
      </div>

      <div className="px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] flex flex-col gap-5">
        {/* Pose steps: done = tick, current = blue outline. */}
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Pose">
          {POSES.map(([id, label]) => {
            const on = id === pose;
            const isDone = done.includes(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() => setPose(id)}
                className="h-10 rounded-full flex items-center justify-center gap-1.5 text-[13px] font-semibold"
                style={on ? { backgroundColor: L.ink, color: L.onInk, boxShadow: `0 0 0 2px ${L.page}, 0 0 0 3.5px ${MEASURE_BLUE}` } : { ...L.tile, color: L.ink }}
              >
                {isDone && <Check size={14} strokeWidth={3} />}
                {label}
              </button>
            );
          })}
        </div>

        <div>
          <h2 className="text-[34px] leading-none font-bold tracking-tight">{guide.title}</h2>
          <p className="mt-2 text-[14px]" style={{ color: L.muted }}>
            {done.length > 0 && !done.includes(pose) ? `${POSE_LABEL[done[done.length - 1]]} saved. ` : ""}
            {guide.line}
          </p>
        </div>

        <Viewfinder pose={pose} L={L} />

        <ol className="flex flex-col" data-testid="pose-steps">
          {guide.steps.map((s, i) => (
            <li key={s} className="flex items-baseline gap-4 py-3 border-t" style={{ borderColor: L.line }}>
              <span className="w-6 shrink-0 text-[20px] font-bold tabular-nums" style={{ color: L.faint }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[14.5px] leading-snug">{s}</span>
            </li>
          ))}
        </ol>

        <div>
          <p className="text-[10.5px] font-bold tracking-[0.2em] mb-2" style={{ color: L.muted }}>
            EVERY TIME
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PHOTO_CONDITIONS.map((c) => (
              <span key={c} className="px-3 py-1.5 rounded-full text-[12px] font-medium" style={{ ...L.tile, color: L.ink }}>
                {c}
              </span>
            ))}
          </div>
        </div>

        {!hideDate && (
        <label className="flex items-center justify-between gap-3 py-3 border-t border-b" style={{ borderColor: L.line }}>
          <span className="text-[13px] font-semibold">Date taken</span>
          <input
            type="date"
            value={dateKey}
            max={localDateKey()}
            onChange={(e) => setDateKey(e.target.value)}
            className="bg-transparent text-[14px] font-semibold text-right outline-none"
            style={{ color: L.ink, colorScheme: dark ? "dark" : "light" }}
          />
        </label>
        )}

        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={picked} data-testid="pose-camera-input" />
        <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={picked} data-testid="pose-library-input" />
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            disabled={busy || !dateKey}
            onClick={() => cameraRef.current?.click()}
            className="h-[52px] rounded-full flex items-center justify-center gap-2 text-[15px] font-bold disabled:opacity-40"
            style={{ backgroundColor: L.ink, color: L.onInk }}
          >
            <Camera size={18} /> {busy ? "Saving…" : `Take ${guide.title} Photo`}
          </button>
          <button
            type="button"
            disabled={busy || !dateKey}
            onClick={() => libraryRef.current?.click()}
            className="h-[52px] rounded-full flex items-center justify-center gap-2 text-[15px] font-semibold disabled:opacity-40"
            style={{ ...L.tile, color: L.ink }}
          >
            <ImageIcon size={18} /> Choose from Library
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function PoseTile({ pose, latest, L, onClick }) {
  const label = POSE_LABEL[pose];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Add ${label}`}
      className="relative aspect-[3/4] rounded-2xl overflow-hidden text-left"
      style={latest ? { backgroundColor: "#111" } : { ...L.tile }}
    >
      {latest ? (
        <>
          <img src={latest.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/55" />
        </>
      ) : (
        <span className="absolute inset-x-0 top-3 bottom-12 flex items-center justify-center">
          <PoseFigure pose={pose} color={L.ink} className="h-full opacity-50" strokeWidth={2.2} />
        </span>
      )}
      <span className="absolute left-2.5 top-2 text-[9.5px] font-bold tracking-[0.16em]" style={{ color: latest ? "rgba(255,255,255,0.85)" : L.muted }}>
        {latest ? `LAST · ${shortDate(latest.date).toUpperCase()}` : label.toUpperCase()}
      </span>
      <span
        className="absolute left-2 right-2 bottom-2 h-8 rounded-full flex items-center justify-center gap-1 text-[12px] font-bold"
        style={latest ? { backgroundColor: "rgba(255,255,255,0.92)", color: "#0A0A0B" } : { backgroundColor: L.ink, color: L.onInk }}
      >
        <Plus size={13} strokeWidth={3} /> Add {label}
      </span>
    </button>
  );
}

// #326: the Log Body Stats sheet's photo slots — the SAME Front / Side / Back
// and the same guide as Progress Photos, so clients see one way to do it.
// items: [{ file, pose, url }] picked in the sheet, not saved yet.
export function PoseSlots({ items, dark, onAdd, onRemove }) {
  const L = clientLook(dark);
  const [guidePose, setGuidePose] = useState(null);
  return (
    <>
      <div className="grid grid-cols-3 gap-2" data-testid="pose-slots">
        {POSES.map(([id, label]) => {
          const mine = items.filter((it) => it.pose === id);
          const last = mine[mine.length - 1];
          return (
            <div key={id} className="relative">
              <button
                type="button"
                onClick={() => setGuidePose(id)}
                aria-label={`Add ${label}`}
                className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden"
                style={last ? { backgroundColor: "#111" } : { ...L.tile }}
              >
                {last ? (
                  <img src={last.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <span className="absolute inset-x-0 top-3 bottom-11 flex items-center justify-center">
                    <PoseFigure pose={id} color={L.ink} className="h-full opacity-50" strokeWidth={2.2} />
                  </span>
                )}
                <span
                  className="absolute left-1.5 right-1.5 bottom-1.5 h-7 rounded-full flex items-center justify-center gap-1 text-[11.5px] font-bold"
                  style={last ? { backgroundColor: "rgba(255,255,255,0.92)", color: "#0A0A0B" } : { backgroundColor: L.ink, color: L.onInk }}
                >
                  {last ? <Check size={12} strokeWidth={3} /> : <Plus size={12} strokeWidth={3} />} {last ? `${label}${mine.length > 1 ? ` ×${mine.length}` : ""}` : `Add ${label}`}
                </span>
              </button>
              {last && (
                <button
                  type="button"
                  aria-label={`Remove ${label} photo`}
                  onClick={() => onRemove(last)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11.5px] leading-snug" style={{ color: L.muted }}>
        Tap a pose for how to take it. Same spot, light and time each time, so your change is easy to see.
      </p>
      <PosePhotoGuide open={!!guidePose} pose={guidePose} dark={dark} hideDate onClose={() => setGuidePose(null)} onAdd={(files, _date, pose) => onAdd(files, pose)} />
    </>
  );
}

function Figure({ value, unit, L }) {
  return (
    <div>
      <p className="text-[30px] leading-none font-bold tabular-nums tracking-tight">{value}</p>
      <p className="mt-1 text-[10px] font-bold tracking-[0.18em]" style={{ color: L.muted }}>
        {unit}
      </p>
    </div>
  );
}

// The coached client's Progress Photos card (#325).
export function PoseProgressSection({ photos, onAdd, onDelete, busy, weighIns, dark }) {
  const L = clientLook(dark);
  const [guidePose, setGuidePose] = useState(null);
  const [viewing, setViewing] = useState(null);
  const ordered = useMemo(() => sortPhotos(photos), [photos]);
  const firstWithTwo = POSES.find(([id]) => (firstAndLatest(ordered, id)?.count || 0) >= 2)?.[0];
  const [pose, setPose] = useState(firstWithTwo || "front");
  const weightFor = (p) => closestWeighIn(weighIns, p.date)?.weight ?? null;
  const pair = firstAndLatest(ordered, pose);
  const figures = pair && pair.count >= 2 ? comparisonFigures(pair.first, pair.latest, weightFor) : null;
  const newestFirst = [...ordered].reverse();

  const frame = (p, tag) => {
    const w = weightFor(p);
    return (
      <button type="button" onClick={() => setViewing(p)} className="flex-1 min-w-0 text-left" aria-label={`${tag} ${longDate(p.date)}`}>
        <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-black">
          <img src={p.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <span className="absolute left-2 top-2 px-2 py-0.5 rounded-full text-[9.5px] font-bold tracking-[0.16em] bg-black/55 text-white">{tag.toUpperCase()}</span>
        </div>
        <p className="mt-1.5 text-[12.5px] font-semibold">{longDate(p.date)}</p>
        <p className="text-[11.5px]" style={{ color: L.muted }}>
          {w != null ? `${w} kg` : "No weigh-in near this date"}
        </p>
      </button>
    );
  };

  return (
    <Card dark={dark}>
      <div className="flex items-baseline justify-between mb-3" style={{ color: L.ink }}>
        <p className="font-semibold">Progress Photos</p>
        <p className="text-[11.5px]" style={{ color: L.muted }}>
          {ordered.length ? `${ordered.length} photo${ordered.length === 1 ? "" : "s"}` : "Front · Side · Back"}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2" data-testid="pose-tiles">
        {POSES.map(([id]) => (
          <PoseTile key={id} pose={id} latest={firstAndLatest(ordered, id)?.latest} L={L} onClick={() => setGuidePose(id)} />
        ))}
      </div>
      <p className="mt-2.5 text-[11.5px] leading-snug" style={{ color: L.muted }}>
        Tap a pose for how to take it. Same spot, light and time each time, so your change is easy to see.
      </p>

      {ordered.length > 0 && (
        <div className="mt-5 pt-4 border-t" style={{ borderColor: L.line, color: L.ink }} data-testid="pose-progress">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-[10.5px] font-bold tracking-[0.2em]" style={{ color: L.muted }}>
              YOUR CHANGE
            </p>
            <div className="flex gap-1" role="group" aria-label="Progress pose">
              {POSES.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={pose === id}
                  onClick={() => setPose(id)}
                  className="px-2.5 h-7 rounded-full text-[11.5px] font-semibold"
                  style={pose === id ? { backgroundColor: L.ink, color: L.onInk } : { color: L.muted }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {pair && pair.count >= 2 ? (
            <>
              {figures && (
                <div className="flex gap-8 mb-3" data-testid="pose-figures">
                  <Figure value={figures.days} unit="DAYS" L={L} />
                  {figures.kg != null && <Figure value={`${figures.kg > 0 ? "+" : figures.kg < 0 ? "−" : ""}${Math.abs(figures.kg)}`} unit="KG" L={L} />}
                  <Figure value={pair.count} unit={`${POSE_LABEL[pose].toUpperCase()} PHOTOS`} L={L} />
                </div>
              )}
              <div className="flex gap-2.5">
                {frame(pair.first, "First")}
                {frame(pair.latest, "Latest")}
              </div>
            </>
          ) : (
            <button type="button" onClick={() => setGuidePose(pose)} className="w-full text-left text-[13px] py-2" style={{ color: L.muted }}>
              {pair ? `One ${POSE_LABEL[pose]} photo so far. Add another to see your change.` : `No ${POSE_LABEL[pose]} photo yet. Add one to start.`}
            </button>
          )}

          <p className="mt-5 mb-2 text-[10.5px] font-bold tracking-[0.2em]" style={{ color: L.muted }}>
            ALL PHOTOS · {ordered.length}
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {newestFirst.map((p) => (
              <button key={p.id} type="button" onClick={() => setViewing(p)} className="relative aspect-[3/4] rounded-xl overflow-hidden bg-black" aria-label={`View photo ${longDate(p.date)}`}>
                <img src={p.url} alt="Progress" className="w-full h-full object-cover" />
                <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[9.5px] font-semibold px-1 pt-3 pb-1 text-center">
                  {shortDate(p.date)}
                  {p.pose ? ` · ${POSE_LABEL[p.pose]}` : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <BottomSheet
        dark={dark}
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `${new Date(viewing.date).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}${viewing.pose ? ` · ${POSE_LABEL[viewing.pose]}` : ""}` : ""}
      >
        {viewing && (
          <div style={{ color: L.ink }}>
            <img src={viewing.url} alt="Progress" className="w-full rounded-2xl mb-3" />
            <p className="text-sm text-center mb-4" style={{ color: L.muted }}>
              {weightFor(viewing) != null ? `${weightFor(viewing)} kg around this time` : "No weigh-in logged near this date."}
            </p>
            <DangerButton
              dark={dark}
              className="w-full"
              onClick={() => {
                onDelete(viewing.id);
                setViewing(null);
              }}
            >
              <X size={14} /> Delete photo
            </DangerButton>
          </div>
        )}
      </BottomSheet>

      <PosePhotoGuide open={!!guidePose} pose={guidePose} dark={dark} busy={busy} onClose={() => setGuidePose(null)} onAdd={onAdd} />
    </Card>
  );
}
