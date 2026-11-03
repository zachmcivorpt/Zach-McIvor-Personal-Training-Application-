import React, { useEffect, useState } from "react";
import { Archive } from "lucide-react";
import { BottomSheet, PrimaryButton } from "../components/ui";
import { localDateKey } from "../lib/dateKey";

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
    <BottomSheet open={open} onClose={onClose} title={resuming ? "Resume program" : "Start program"} dark={dark}>
      <p className="text-[11px] font-semibold tracking-[0.14em] uppercase" style={{ color: t.textMuted }}>
        {current ? "Your new program" : "Your program"}
      </p>
      <p className="text-2xl font-semibold tracking-[-0.02em] leading-tight mt-1">{programName}</p>
      {resuming ? (
        <p className="text-sm mt-2" style={{ color: t.textMuted }}>
          Picks up at Week {resumeWeek}, starting this week.
        </p>
      ) : (
        <>
          <label className="block text-sm mt-5 mb-2" style={{ color: t.textMuted }} htmlFor="solo-switch-start">
            Week 1, Day 1 starts
          </label>
          <input
            id="solo-switch-start"
            type="date"
            value={startDate}
            min={localDateKey()}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-xl px-3.5 py-2.5 text-sm"
            style={{ backgroundColor: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, colorScheme: dark ? "dark" : "light" }}
          />
        </>
      )}

      {current && (
        <div className="flex items-start gap-3 mt-5 pt-4 border-t" style={{ borderColor: t.panelBorder }}>
          <Archive size={16} className="shrink-0 mt-0.5" color={t.textMuted} />
          <p className="text-sm leading-relaxed" style={{ color: t.textMuted }}>
            <span style={{ color: t.text }} className="font-semibold">
              {current.name}
            </span>{" "}
            moves to Archived{current.week ? ` at Week ${current.week}` : ""}. Everything you've logged stays, and you can resume it any time.
          </p>
        </div>
      )}

      {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
      <PrimaryButton dark={dark} className="w-full mt-6" onClick={() => run(() => onConfirm(startDate))} disabled={busy || (!resuming && !startDate)}>
        {busy ? "ONE MOMENT…" : current ? "SWITCH PROGRAM" : resuming ? "RESUME" : "START PROGRAM"}
      </PrimaryButton>
      {onLater && (
        <button type="button" onClick={() => run(onLater)} disabled={busy} className="w-full text-sm font-semibold py-3 mt-1" style={{ color: t.textMuted }}>
          Keep it for later
        </button>
      )}
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
    <BottomSheet open={open} onClose={onClose} title="How your programs work" dark={dark}>
      <ol className="border-t" style={{ borderColor: t.panelBorder }}>
        {GUIDE.map(([title, body], i) => (
          <li key={title} className="flex gap-4 py-4 border-b" style={{ borderColor: t.panelBorder }}>
            <span className="text-[28px] leading-none font-semibold tabular-nums tracking-[-0.03em] w-7 shrink-0" style={{ color: t.textFaint }}>
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold">{title}</span>
              <span className="block text-sm leading-relaxed mt-1" style={{ color: t.textMuted }}>
                {body}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <PrimaryButton dark={dark} className="w-full mt-6" onClick={onClose}>
        GOT IT
      </PrimaryButton>
    </BottomSheet>
  );
}
