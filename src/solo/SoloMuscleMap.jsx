import React, { useMemo, useState } from "react";
import { Card } from "../components/ui";
import { SOLO_THEMES } from "./SoloThemeContext";
import { MuscleBody, TRAINED_RED, READY_BLUE } from "./MuscleBody";
import { trainedMuscles, intensity, muscleSummary, muscleDetail, MUSCLE_LABELS } from "./muscleMap";
import MuscleHologram, { webglAvailable } from "./MuscleHologram";

// The muscle map on Progress (#148): one glass card with the body (Front /
// Back), two large figures, and what's trained (red) and ready (blue).
// Last 72 hours (about a muscle's recovery time), from their own logs.
// The body is the 3D hologram (#194, MuscleHologram.jsx: swipe to turn, tap
// a muscle); without WebGL it's the 2D MuscleBody, as before.

// The 3D map's own panel (#195), as approved in the mock-up: always dark
// (a lit hologram needs it), in light mode too.
const HOLO = {
  bg: "#03060C",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.62)",
  faint: "rgba(255,255,255,0.4)",
  line: "rgba(160,210,255,0.22)",
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function lastTrainedDay(ts, now) {
  if (!ts) return "–";
  const d = new Date(ts);
  const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return "Today";
  if (days < 7) return DAYS[d.getDay()];
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const pill = {
  height: 40,
  minWidth: 68,
  padding: "0 14px",
  borderRadius: 20,
  border: `1px solid ${HOLO.line}`,
  background: "rgba(255,255,255,0.07)",
  color: HOLO.text,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
};

function MuscleMap3DPanel({ logs, exercisesById, trained, levels, worked, ready, since, now, onUnavailable }) {
  const [view, setView] = useState("front");
  const [spin, setSpin] = useState(false);
  const [selected, setSelected] = useState(() => worked[0] || "chest");
  const detail = useMemo(() => muscleDetail(selected, logs, exercisesById, { now }), [selected, logs, exercisesById]); // eslint-disable-line react-hooks/exhaustive-deps
  const recovering = trained[selected]?.sets > 0;
  const hoursAgo = recovering ? Math.max(0, Math.round((now - trained[selected].last) / 3600000)) : 0;
  const turn = (v) => {
    setSpin(false);
    setView(v);
  };

  return (
    <div
      data-testid="muscle-map"
      className="relative overflow-hidden rounded-[28px] px-5 pt-6 pb-5"
      style={{
        background: HOLO.bg,
        color: HOLO.text,
        backgroundImage: "linear-gradient(rgba(47,143,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(47,143,255,0.06) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
    >
      <p className="text-[24px] font-semibold leading-tight">Muscle map</p>
      <p className="text-[13px] mt-1" style={{ color: HOLO.muted }}>
        Tap a muscle. Swipe to turn the body.
      </p>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <div className="text-[34px] font-bold leading-none tabular-nums">{since == null ? "–" : since}</div>
          <div className="text-[11px] font-semibold tracking-[0.08em] uppercase mt-1" style={{ color: HOLO.muted }}>
            {since === 1 ? "Day" : "Days"} since last session
          </div>
        </div>
        <div>
          <div className="text-[34px] font-bold leading-none tabular-nums" style={{ color: READY_BLUE }}>
            {ready.length}
          </div>
          <div className="text-[11px] font-semibold tracking-[0.08em] uppercase mt-1" style={{ color: HOLO.muted }}>
            Muscle groups ready
          </div>
        </div>
      </div>

      <div className="relative -mx-5 mt-2">
        <div className="absolute left-5 top-3 z-10 flex flex-col gap-1.5 text-[11px] pointer-events-none" style={{ color: HOLO.muted }}>
          <span className="flex items-center gap-1.5">
            <i className="inline-block w-2 h-2 rounded-full" style={{ background: "#FFFFFF", boxShadow: "0 0 8px #fff" }} />
            Recovering
          </span>
          <span className="flex items-center gap-1.5">
            <i className="inline-block w-2 h-2 rounded-full" style={{ background: READY_BLUE, boxShadow: `0 0 8px ${READY_BLUE}` }} />
            Ready
          </span>
        </div>
        <div className="absolute right-5 top-3 z-10 flex flex-col gap-1.5">
          <button type="button" style={pill} aria-pressed={view === "front" && !spin} onClick={() => turn("front")}>
            FRONT
          </button>
          <button type="button" style={pill} aria-pressed={view === "back" && !spin} onClick={() => turn("back")}>
            BACK
          </button>
          <button type="button" style={pill} aria-pressed={spin} onClick={() => setSpin((v) => !v)}>
            {spin ? "STOP" : "SPIN"}
          </button>
        </div>
        <MuscleHologram view={view} levels={levels} selected={selected} onSelect={setSelected} spin={spin} onUserTurn={() => setSpin(false)} onUnavailable={onUnavailable} />
      </div>

      <section
        data-testid="muscle-map-selected"
        aria-live="polite"
        className="relative -mt-6 rounded-[26px] p-4"
        style={{
          background: "linear-gradient(140deg, rgba(255,255,255,0.12), rgba(255,255,255,0.03))",
          border: `1px solid ${HOLO.line}`,
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="m-0 text-[20px] font-bold">{MUSCLE_LABELS[selected]}</h3>
          <span
            className="text-[11px] font-bold tracking-[0.08em] uppercase rounded-xl px-2.5 py-1.5 whitespace-nowrap"
            style={recovering ? { background: "rgba(255,255,255,0.16)", color: "#fff" } : { background: "rgba(47,143,255,0.18)", color: "#9FD0FF" }}
          >
            {recovering ? `Recovering · ${hoursAgo} h` : "Ready"}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div>
            <b className="block text-[22px] font-bold tabular-nums">{detail.sets7 || 0}</b>
            <span className="text-[10px] font-semibold tracking-[0.08em] uppercase" style={{ color: HOLO.muted }}>Sets · 7 days</span>
          </div>
          <div>
            <b className="block text-[22px] font-bold">{lastTrainedDay(detail.last, now)}</b>
            <span className="text-[10px] font-semibold tracking-[0.08em] uppercase" style={{ color: HOLO.muted }}>Last trained</span>
          </div>
          <div>
            <b className="block text-[22px] font-bold tabular-nums">{detail.bestKg == null ? "–" : detail.bestKg}</b>
            <span className="text-[10px] font-semibold tracking-[0.08em] uppercase" style={{ color: HOLO.muted }}>Best est. max kg</span>
          </div>
        </div>
        <p className="text-[13px] mt-3 mb-0" style={{ color: HOLO.muted }}>
          {detail.exercises.length ? detail.exercises.join(" · ") : "Not trained yet"}
        </p>
        <p className="text-[10px] mt-2 mb-0" style={{ color: HOLO.faint }}>
          Recovering = trained in the last 72 hours. Anatomy: BodyParts3D © DBCLS (CC BY 4.0), via open-anatomy-3d.
        </p>
      </section>
    </div>
  );
}

// Whole calendar days since their most recent logged session (any age).
export function daysSinceLastSession(logs, now = Date.now()) {
  const last = Math.max(0, ...(logs || []).map((l) => Number(new Date(l?.date)) || 0).filter((v) => v <= now + 3600000));
  if (!last) return null;
  const day = (ts) => {
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  return Math.max(0, Math.round((day(now) - day(last)) / 86400000));
}

function Figure({ value, label, color, text, muted, align = "left" }) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className="text-[32px] leading-none font-semibold tabular-nums" style={{ color: color || text }}>
        {value}
      </div>
      <div className="text-[10px] font-semibold tracking-[0.1em] uppercase mt-1.5 leading-snug" style={{ color: muted }}>
        {label}
      </div>
    </div>
  );
}

const sets = (n) => Math.round(n * 10) / 10;

export function SoloMuscleMapCard({ logs, exercisesById, dark }) {
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const [view, setView] = useState("front");
  const [threeD, setThreeD] = useState(() => webglAvailable());
    const now = Date.now();
  const trained = useMemo(() => trainedMuscles(logs || [], exercisesById || {}, { now }), [logs, exercisesById]); // eslint-disable-line react-hooks/exhaustive-deps
  const levels = useMemo(() => Object.fromEntries(Object.entries(trained).map(([m, v]) => [m, intensity(v.sets)])), [trained]);
  const { worked, ready } = muscleSummary(trained);
  const since = daysSinceLastSession(logs, now);

  if (threeD) {
    return (
      <MuscleMap3DPanel
        logs={logs || []}
        exercisesById={exercisesById || {}}
        trained={trained}
        levels={levels}
        worked={worked}
        ready={ready}
        since={since}
        now={now}
        onUnavailable={() => setThreeD(false)}
      />
    );
  }

  return (
    <Card dark={dark}>
      <div data-testid="muscle-map" style={{ color: t.text }}>
        <div className="flex items-center justify-between">
          <p className="font-semibold">Muscle Map</p>
          <div className="flex gap-4" role="tablist" aria-label="Body side">
            {["front", "back"].map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className="text-[11px] font-bold uppercase tracking-[0.12em] pb-0.5 border-b-2" style={{ color: view === v ? t.text : t.textFaint, borderColor: view === v ? READY_BLUE : "transparent" }}>
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="relative mt-4">
          <div className="absolute left-0 top-0 z-10">
            <Figure value={since == null ? "–" : since} label={<>Days since<br />last session</>} text={t.text} muted={t.textMuted} />
          </div>
          <div className="absolute right-0 top-0 z-10">
            <Figure value={ready.length} label={<>Muscle groups<br />ready</>} color={READY_BLUE} text={t.text} muted={t.textMuted} align="right" />
          </div>
          <div className="flex justify-center pt-2">
            <MuscleBody view={view} levels={levels} dark={dark} style={{ height: 320 }} />
          </div>
        </div>

        <div className="mt-4 border-t pt-3 space-y-2 text-[13px] leading-snug" style={{ borderColor: t.panelBorder }}>
          <p data-testid="muscle-map-trained">
            <span className="font-semibold" style={{ color: TRAINED_RED }}>Trained</span>
            <span style={{ color: t.textMuted }}>
              {" "}
              {worked.length ? worked.map((m) => `${MUSCLE_LABELS[m]} ${sets(trained[m].sets)}`).join(" · ") : "nothing in the last 3 days"}
            </span>
          </p>
          {ready.length > 0 && (
            <p data-testid="muscle-map-ready">
              <span className="font-semibold" style={{ color: READY_BLUE }}>Ready</span>
              <span style={{ color: t.textMuted }}> {ready.map((m) => MUSCLE_LABELS[m]).join(" · ")}</span>
            </p>
          )}
          <p className="text-[11px]" style={{ color: t.textFaint }}>
            Sets logged in the last 72 hours; helping muscles count as half a set.
          </p>
        </div>
      </div>
    </Card>
  );
}
