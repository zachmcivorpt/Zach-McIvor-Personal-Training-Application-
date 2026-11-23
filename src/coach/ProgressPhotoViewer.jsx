// #324 (owner, 2026-11-24): the coach opens a client's progress photo full
// screen, tags it Front / Side / Back, steps through the others, and compares
// two dates. Coach console only; portalled like every full-screen coach
// overlay (#217). Figures come only from the client's own weigh-ins.
// #325 (owner: "looks cheap"): rebuilt as a premium viewer — the photo's own
// blurred colours behind glass, large date / kg figures, a filmstrip, and
// Compare as Before / After side by side or a slider, with big DAYS / KG.
import React, { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { MEASURE_BLUE } from "../theme";
import { POSES, POSE_LABEL, sortPhotos, filterByPose, defaultComparison, comparisonFigures } from "../lib/progressPhotos";

const fmtDate = (ms) => new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const dayMonth = (ms) => new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
const yearOf = (ms) => new Date(ms).getFullYear();

const PANE = {
  backgroundColor: "rgba(18,18,22,0.55)",
  backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 60%)",
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "0 24px 48px -24px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.12)",
  backdropFilter: "blur(24px) saturate(160%)",
  WebkitBackdropFilter: "blur(24px) saturate(160%)",
};
const FRAME_SHADOW = "0 0 0 1px rgba(255,255,255,0.1), 0 30px 60px -30px rgba(0,0,0,0.95)";
const CAPS = "text-[9.5px] font-bold tracking-[0.22em] text-white/45";

// A segmented control with one sliding lit pill.
function Segmented({ options, value, onChange, label, size = "md" }) {
  const i = options.findIndex(([id]) => id === value);
  const h = size === "sm" ? "h-8 text-[11.5px]" : "h-9 text-[12.5px]";
  return (
    <div className="relative grid rounded-full p-[3px]" style={{ ...PANE, gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="group" aria-label={label}>
      {i >= 0 && (
        <span
          className="absolute top-[3px] bottom-[3px] rounded-full transition-transform duration-200 ease-out"
          style={{
            left: 3,
            width: `calc((100% - 6px) / ${options.length})`,
            transform: `translateX(${i * 100}%)`,
            background: "linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.1))",
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), 0 0 0 1px rgba(255,255,255,0.12), 0 0 18px -6px ${MEASURE_BLUE}`,
          }}
        />
      )}
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={`relative ${h} px-2 rounded-full font-semibold tracking-wide whitespace-nowrap ${value === id ? "text-white" : "text-white/55"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Filmstrip({ photos, selectedId, onPick, weightFor, label }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-1 py-1.5" data-testid="photo-strip" role="group" aria-label={label}>
      {photos.map((p) => {
        const w = weightFor(p);
        const on = p.id === selectedId;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            aria-label={`${fmtDate(p.date)}${p.pose ? ` · ${POSE_LABEL[p.pose]}` : ""}`}
            aria-pressed={on}
            className={`relative shrink-0 w-[52px] h-[68px] rounded-[10px] overflow-hidden transition-opacity ${on ? "opacity-100" : "opacity-55"}`}
            style={{ boxShadow: on ? `0 0 0 1.5px #fff, 0 0 0 3.5px ${MEASURE_BLUE}` : "inset 0 0 0 1px rgba(255,255,255,0.12)" }}
          >
            <img src={p.url} alt="" className="w-full h-full object-cover" />
            <span className="absolute bottom-0 inset-x-0 pt-3 pb-0.5 bg-gradient-to-t from-black/80 to-transparent text-white text-[8.5px] font-semibold leading-tight text-center">
              {dayMonth(p.date)}
              {w != null ? <span className="block text-white/70">{w}kg</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BigFigure({ value, unit }) {
  return (
    <div className="min-w-0">
      <p className="text-white text-[30px] sm:text-[38px] leading-none font-bold tabular-nums tracking-tight">{value}</p>
      <p className={`mt-1.5 ${CAPS}`}>{unit}</p>
    </div>
  );
}

function Tag({ children, className = "" }) {
  return (
    <span className={`absolute top-3 px-2 py-1 rounded-full text-[9.5px] font-bold tracking-[0.22em] text-white/85 ${className}`} style={PANE}>
      {children}
    </span>
  );
}

// Before / After slider: the After photo clipped over the Before one.
function BeforeAfterSlider({ before, after }) {
  const [pos, setPos] = useState(50);
  const box = useRef(null);
  const dragging = useRef(false);
  const setFrom = (clientX) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };
  return (
    <div
      ref={box}
      className="relative w-full h-full rounded-[22px] overflow-hidden select-none bg-black"
      style={{ touchAction: "none", boxShadow: FRAME_SHADOW }}
      data-testid="compare-slider"
      onPointerDown={(e) => {
        dragging.current = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* iOS touch pointers can refuse capture */
        }
        setFrom(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && setFrom(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <img src={before.url} alt={`Before ${fmtDate(before.date)}`} className="absolute inset-0 w-full h-full object-contain" draggable={false} />
      <img
        src={after.url}
        alt={`After ${fmtDate(after.date)}`}
        className="absolute inset-0 w-full h-full object-contain"
        style={{ clipPath: `inset(0 0 0 ${pos}%)`, WebkitClipPath: `inset(0 0 0 ${pos}%)` }}
        draggable={false}
      />
      <div className="absolute inset-y-0 w-px bg-white/90" style={{ left: `${pos}%`, boxShadow: `0 0 12px ${MEASURE_BLUE}` }} />
      <div
        role="slider"
        tabIndex={0}
        aria-label="Before and after"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 5));
          if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + 5));
        }}
        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-white"
        style={{ left: `${pos}%`, ...PANE, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.3), 0 0 0 1px rgba(255,255,255,0.25), 0 0 24px -4px ${MEASURE_BLUE}` }}
      >
        <ChevronLeft size={14} />
        <ChevronRight size={14} />
      </div>
      <Tag className="left-3">BEFORE</Tag>
      <Tag className="right-3">AFTER</Tag>
    </div>
  );
}

function Frame({ photo, tag }) {
  return (
    <div className="relative w-full h-full rounded-[22px] overflow-hidden bg-black" style={{ boxShadow: FRAME_SHADOW }}>
      {photo ? <img src={photo.url} alt={`Progress ${fmtDate(photo.date)}`} className="absolute inset-0 w-full h-full object-contain" /> : null}
      <Tag className="left-3">{tag}</Tag>
    </div>
  );
}

// One side's picker under the compare view: label + filmstrip.
function Side({ photo, photos, onPick, weightFor, testId, tag }) {
  const w = photo ? weightFor(photo) : null;
  return (
    <div className="flex-1 min-w-0 flex flex-col gap-0.5" data-testid={testId}>
      <div className="px-1">
        <p className={CAPS}>{tag}</p>
        <p className="mt-0.5 text-white text-[11px] font-semibold leading-tight">
          {photo ? fmtDate(photo.date) : "–"}
          {w != null ? ` · ${w}kg` : ""}
          {photo?.pose ? ` · ${POSE_LABEL[photo.pose]}` : ""}
        </p>
      </div>
      <Filmstrip photos={photos} selectedId={photo?.id} onPick={onPick} weightFor={weightFor} label={`${tag} photo`} />
    </div>
  );
}

// photos: the client's progress photos; startId: the one tapped.
// onSetPose(photoId, pose|null) saves the tag; weightFor(photo) → kg|null.
export default function ProgressPhotoViewer({ photos, startId, onClose, onSetPose, weightFor }) {
  const ordered = useMemo(() => sortPhotos(photos), [photos]);
  const [currentId, setCurrentId] = useState(startId);
  const [mode, setMode] = useState("single");
  const [layout, setLayout] = useState("side");
  const [poseFilter, setPoseFilter] = useState("all");
  const [otherId, setOtherId] = useState(null);
  const swipe = useRef(null);

  const current = ordered.find((p) => p.id === currentId) || ordered[0] || null;
  const idx = current ? ordered.findIndex((p) => p.id === current.id) : -1;
  const go = (d) => {
    const next = ordered[idx + d];
    if (next) setCurrentId(next.id);
  };
  const other = ordered.find((p) => p.id === otherId) || defaultComparison(current, ordered);
  const listed = filterByPose(ordered, poseFilter);
  const compare = mode === "compare" && !!other;
  // Before = the older of the two, After = the newer.
  const otherIsBefore = other && current ? (other.date || 0) <= (current.date || 0) : true;
  const before = otherIsBefore ? other : current;
  const after = otherIsBefore ? current : other;
  const figures = compare ? comparisonFigures(other, current, weightFor) : null;
  if (!current || typeof document === "undefined") return null;
  const w = weightFor(current);
  const pickBefore = (p) => (otherIsBefore ? setOtherId(p.id) : setCurrentId(p.id));
  const pickAfter = (p) => (otherIsBefore ? setCurrentId(p.id) : setOtherId(p.id));

  return createPortal(
    <div className="fixed inset-0 z-[150] flex flex-col overflow-hidden text-white" style={{ backgroundColor: "#050506" }} data-testid="photo-viewer">
      {/* The photo's own colours, blurred, behind everything. */}
      <img
        src={current.url}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover scale-125 opacity-35 pointer-events-none"
        style={{ filter: "blur(60px) saturate(140%)", WebkitFilter: "blur(60px) saturate(140%)" }}
      />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(120% 80% at 50% 0%, rgba(5,5,6,0.25), rgba(5,5,6,0.92) 70%)" }} />

      <div className="relative shrink-0 flex items-center gap-3 px-3 pb-2 pt-[calc(0.6rem+env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center" style={PANE}>
          <X size={18} />
        </button>
        <div className="flex-1 flex justify-center">
          <div className="w-[210px]">
            <Segmented
              label="View"
              value={compare ? "compare" : "single"}
              onChange={(m) => setMode(m === "compare" && ordered.length < 2 ? "single" : m)}
              options={[
                ["single", "Photo"],
                ["compare", "Compare"],
              ]}
            />
          </div>
        </div>
        <p className="w-10 shrink-0 text-right text-[12px] font-semibold tabular-nums text-white/60">
          {idx + 1}/{ordered.length}
        </p>
      </div>

      {compare ? (
        <div className="relative flex-1 min-h-0 flex flex-col gap-3 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="flex items-end gap-6 sm:gap-10 px-1 pt-1">
            <div className="flex items-end gap-6 sm:gap-10" data-testid="compare-figures">
              <BigFigure value={figures.days} unit="DAYS APART" />
              {figures.kg != null && <BigFigure value={`${figures.kg > 0 ? "+" : figures.kg < 0 ? "−" : ""}${Math.abs(figures.kg)}`} unit="KG CHANGE" />}
            </div>
            <div className="ml-auto w-[160px] sm:w-[200px]">
              <Segmented
                size="sm"
                label="Compare layout"
                value={layout}
                onChange={setLayout}
                options={[
                  ["side", "Side by side"],
                  ["slider", "Slider"],
                ]}
              />
            </div>
          </div>
          <div className="flex-1 min-h-0 flex gap-2">
            {layout === "slider" ? (
              <BeforeAfterSlider before={before} after={after} />
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <Frame photo={before} tag="BEFORE" />
                </div>
                <div className="flex-1 min-w-0">
                  <Frame photo={after} tag="AFTER" />
                </div>
              </>
            )}
          </div>
          <Segmented size="sm" label="Show poses" value={poseFilter} onChange={setPoseFilter} options={[["all", "All"], ...POSES]} />
          <div className="flex gap-2.5">
            <Side testId="compare-left" tag="BEFORE" photo={before} photos={listed} onPick={pickBefore} weightFor={weightFor} />
            <Side testId="compare-right" tag="AFTER" photo={after} photos={listed} onPick={pickAfter} weightFor={weightFor} />
          </div>
        </div>
      ) : (
        <>
          <div
            className="relative flex-1 min-h-0 px-3"
            onTouchStart={(e) => (swipe.current = e.touches[0]?.clientX ?? null)}
            onTouchEnd={(e) => {
              const x0 = swipe.current;
              const x = e.changedTouches[0]?.clientX;
              swipe.current = null;
              if (x0 == null || x == null || Math.abs(x - x0) < 50) return;
              go(x < x0 ? 1 : -1);
            }}
          >
            <div className="relative w-full h-full rounded-[24px] overflow-hidden bg-black" style={{ boxShadow: FRAME_SHADOW }}>
              <img src={current.url} alt={`Progress ${fmtDate(current.date)}`} className="absolute inset-0 w-full h-full object-contain" />
              <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/85 to-transparent pointer-events-none" />
              <div className="absolute left-4 bottom-4" data-testid="photo-stamp">
                <span className="sr-only">{`${fmtDate(current.date)}${w != null ? ` · ${w}kg` : ""}`}</span>
                <p aria-hidden="true" className="text-white text-[30px] leading-none font-bold tracking-tight">
                  {dayMonth(current.date)}
                </p>
                <p aria-hidden="true" className="mt-1.5 text-white/60 text-[11.5px] font-semibold tracking-wide">
                  {yearOf(current.date)}
                  {w != null ? ` · ${w} kg` : ""}
                  {current.pose ? ` · ${POSE_LABEL[current.pose]}` : ""}
                </p>
              </div>
              {idx > 0 && (
                <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center" style={PANE}>
                  <ChevronLeft size={20} />
                </button>
              )}
              {idx < ordered.length - 1 && (
                <button type="button" onClick={() => go(1)} aria-label="Next photo" className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center" style={PANE}>
                  <ChevronRight size={20} />
                </button>
              )}
            </div>
          </div>
          <div className="relative shrink-0 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex flex-col gap-2">
            <div className="flex items-center gap-3 px-1">
              <p className={`shrink-0 w-10 ${CAPS}`}>POSE</p>
              <div className="flex-1">
                <Segmented label="Pose" value={current.pose || null} onChange={(pose) => onSetPose(current.id, pose === current.pose ? null : pose)} options={POSES} />
              </div>
            </div>
            <Filmstrip photos={ordered} selectedId={current.id} onPick={(p) => setCurrentId(p.id)} weightFor={weightFor} label="All photos" />
          </div>
        </>
      )}
    </div>,
    document.body
  );
}
