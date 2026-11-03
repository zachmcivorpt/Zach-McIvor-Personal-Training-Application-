import React, { useEffect, useState } from "react";
import { Archive } from "lucide-react";
import { BottomSheet } from "../components/ui";
import { SoloButton, SoloTextButton, SOLO_TYPE } from "./SoloUI";
import { localDateKey } from "../lib/dateKey";
import { soloClearSheetGlass, CLEAR_SHEET_BACKDROP } from "./SoloThemeContext";

// One program at a time (#140, src/solo/currentProgram.js): the sheet every
// "start / resume / switch program" goes through — from the catalogue, My
// Training's archived programs, a bought program, or a program just built.
//
//   programName   what's being started
//   resumeWeek    set when it was archived after starting: it picks up there
//   current       { name, week } of the program it replaces, or null
//   onConfirm(startDate) does the switch (SoloAppContext.switchSoloProgram)
//   onLater       optional "Keep it for later" (a program just built)
export function SwitchProgramSheet({ open, onClose, programName, resumeWeek = null, current = null, onConfirm, onLater, defaultStartDate, dark, t }) {
  const [startDate, setStartDate] = useState(() => localDateKey());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const today = localDateKey();
    setStartDate(defaultStartDate && defaultStartDate >= today ? defaultStartDate : today);
    setError("");
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch {
      setError("Couldn't update your program — check your connection and try again.");
      setBusy(false);
    }
  }

  const resuming = !!resumeWeek;
  return (
    <BottomSheet open={open} onClose={onClose} title={resuming ? "Resume program" : "Start program"} dark={dark} surface={soloClearSheetGlass(dark)} backdropClassName={CLEAR_SHEET_BACKDROP}>
      {/* Sheets open outside the page: give their text the theme colour, or it falls back to black (dark mode, #146). */}
      <div style={{ color: t.text }}>
      <p className={SOLO_TYPE.eyebrow} style={{ color: t.textMuted }}>
        {current ? "Your new program" : "Your program"}
      </p>
      <p className={`${SOLO_TYPE.sheetTitle} mt-1.5`}>{programName}</p>
      {resuming ? (
        <p className={`${SOLO_TYPE.body} mt-2`} style={{ color: t.textMuted }}>
          Picks up at Week {resumeWeek}, starting this week.
        </p>
      ) : (
        <>
          <label className={`block ${SOLO_TYPE.meta} mt-6 mb-2`} style={{ color: t.textMuted }} htmlFor="solo-switch-start">
            Week 1, Day 1 starts
          </label>
          <input
            id="solo-switch-start"
            type="date"
            value={startDate}
            min={localDateKey()}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-xl px-3.5 py-2.5 text-[13px]"
            style={{ backgroundColor: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, colorScheme: dark ? "dark" : "light" }}
          />
        </>
      )}

      {current && (
        <div className="flex items-start gap-3 mt-6 pt-4 border-t" style={{ borderColor: t.panelBorder }}>
          <Archive size={14} strokeWidth={1.75} className="shrink-0 mt-0.5" color={t.textMuted} />
          <p className={SOLO_TYPE.body} style={{ color: t.textMuted }}>
            <span style={{ color: t.text }} className="font-semibold">
              {current.name}
            </span>{" "}
            moves to Archived{current.week ? ` at Week ${current.week}` : ""}. Everything you've logged stays, and you can resume it any time.
          </p>
        </div>
      )}

      {error && <p className="text-red-500 text-[13px] mt-4">{error}</p>}
      <SoloButton t={t} className="mt-7" onClick={() => run(() => onConfirm(startDate))} disabled={busy || (!resuming && !startDate)}>
        {busy ? "One moment…" : current ? "Switch program" : resuming ? "Resume" : "Start program"}
      </SoloButton>
      {onLater && (
        <SoloTextButton t={t} className="mt-1" onClick={() => run(onLater)} disabled={busy}>
          Keep it for later
        </SoloTextButton>
      )}
      </div>
    </BottomSheet>
  );
}

const GUIDE = [
  ["One program at a time", "Your calendar runs one program, so every week has a clear plan."],
  ["Switch whenever you like", "Starting a program from the catalogue, or one you've built, moves your current one to Archived. Nothing is lost."],
  ["Pick up where you left off", "Tap an archived program to resume it from the week you stopped. Your sessions, weights and progress are all still there."],
];

// The run-through: shown once, the first time someone has a program, and
// any time from "How it works" next to Your program.
export function ProgramsGuideSheet({ open, onClose, dark, t }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="How your programs work" dark={dark} surface={soloClearSheetGlass(dark)} backdropClassName={CLEAR_SHEET_BACKDROP}>
      {/* Sheets open outside the page: give their text the theme colour, or it falls back to black (dark mode, #146). */}
      <div style={{ color: t.text }}>
      <ol className="border-t" style={{ borderColor: t.panelBorder }}>
        {GUIDE.map(([title, body], i) => (
          <li key={title} className="flex gap-4 py-4 border-b" style={{ borderColor: t.panelBorder }}>
            <span className="text-[22px] leading-none font-semibold tabular-nums tracking-[-0.03em] w-6 shrink-0" style={{ color: t.textFaint }}>
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold">{title}</span>
              <span className={`block ${SOLO_TYPE.body} mt-1`} style={{ color: t.textMuted }}>
                {body}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <SoloButton t={t} className="mt-7" onClick={onClose}>
        Got it
      </SoloButton>
      </div>
    </BottomSheet>
  );
}

// Put one of their own saved sessions on a day (#142): the next 7 days as
// one row of chips, the best one already picked (their next training day
// without a session, else today), then one button.
export function PlanSessionSheet({ open, onClose, session, days, suggested, onConfirm, dark, t }) {
  const [pick, setPick] = useState(suggested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setPick(suggested);
    setBusy(false);
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await onConfirm(pick);
    } catch {
      setError("Couldn't add it — check your connection and try again.");
      setBusy(false);
    }
  }
  return (
    <BottomSheet open={open} onClose={onClose} title="Plan this session" dark={dark} surface={soloClearSheetGlass(dark)} backdropClassName={CLEAR_SHEET_BACKDROP}>
      {/* Sheets open outside the page: give their text the theme colour, or it falls back to black (dark mode, #146). */}
      <div style={{ color: t.text }}>
      <p className={SOLO_TYPE.eyebrow} style={{ color: t.textMuted }}>
        Which day?
      </p>
      <p className={`${SOLO_TYPE.sheetTitle} mt-1.5`}>{session?.name}</p>
      <div className="grid grid-cols-7 gap-1 mt-5" role="group" aria-label="Day">
        {(days || []).map((d) => {
          const on = d.key === pick;
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => setPick(d.key)}
              aria-pressed={on}
              aria-label={d.full}
              className="flex flex-col items-center justify-center rounded-2xl py-2"
              style={on ? { backgroundColor: t.text, color: t.bg } : { backgroundColor: "transparent", border: `1px solid ${t.panelBorder}`, color: t.text }}
            >
              <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ opacity: 0.7 }}>
                {d.weekday}
              </span>
              <span className="text-[15px] font-semibold tabular-nums leading-tight mt-0.5">{d.date}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="text-red-500 text-[13px] mt-4">{error}</p>}
      <SoloButton t={t} className="mt-7" onClick={confirm} disabled={busy || !pick}>
        {busy ? "One moment…" : "Add to calendar"}
      </SoloButton>
      </div>
    </BottomSheet>
  );
}
