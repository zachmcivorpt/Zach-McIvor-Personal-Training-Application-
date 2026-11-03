import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, Minus, Plus, Trash2 } from "lucide-react";
import { BottomSheet, PrimaryButton, SecondaryButton } from "../components/ui";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES, soloGlass } from "./SoloThemeContext";
import { dayFromSession, validateCustomProgram, customProgramKey, MAX_PROGRAM_WEEKS, MAX_PROGRAM_DAYS, fillWeekdays, nextWeekday, byWeekday, defaultProgramName, WEEK_ORDER, WEEKDAY_SHORT } from "./customPrograms";
import { sessionDateKeys, sessionDayLabel } from "./soloCalendar";
import { canUse } from "./soloAccess";
import { useSoloPaywall } from "./SoloPaywall";
import { localDateKey } from "../lib/dateKey";
import { SwitchProgramSheet } from "./SoloProgramSwitch";
import { weekInProgram } from "./currentProgram";

// Plus: build a multi-week program from your own saved sessions
// (customPrograms.js). The sessions you pick are one week; it repeats for
// the number of weeks you choose, on your calendar from the start date,
// with suggested weights moving you on week to week. Editing an existing
// one passes { programId } in the route state.
export default function SoloProgramBuilderScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    soloCurrentUser,
    soloCustomSessions,
    soloCustomPrograms,
    saveSoloCustomProgram,
    deleteSoloCustomProgram,
    soloAccess,
    soloEntitlementReady = true,
    soloCurrentProgram,
    soloProgramsById,
    switchSoloProgram,
    keepSoloProgramForLater,
  } = useSoloApp();
  const { openPaywall } = useSoloPaywall();
  const { dark, accent } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const existing = soloCustomPrograms.find((p) => p.id === location.state?.programId) || null;
  const allowed = canUse("programBuilder", soloAccess);

  const [name, setName] = useState(existing?.name || "");
  const [weeks, setWeeks] = useState(existing?.weeks || 6);
  // Each session sits on a weekday, picked for them (#142): their training
  // days from the consultation first, else spread out. An older program
  // gets its weekdays from where its sessions already fell.
  const trainingDays = soloCurrentUser?.onboarding?.answers?.trainingDays || [];
  const [days, setDays] = useState(() => {
    const list = existing?.days || [];
    const saved = Array.isArray(existing?.weekdays) && existing.weekdays.length === list.length ? existing.weekdays : null;
    return fillWeekdays(list.map((d, i) => ({ ...d, weekday: saved ? Number(saved[i]) : d.weekday ?? null })), trainingDays);
  });
  const [startDate, setStartDate] = useState(existing?.startDate || localDateKey());
  const [dateOpen, setDateOpen] = useState(false);
  const [dayPickerFor, setDayPickerFor] = useState(null); // a session's id while choosing its weekday
  const week = [...days].sort(byWeekday);
  const firstSessionKey = days.length ? [...sessionDateKeys(startDate, 1, days.length, [], [...days].sort(byWeekday).map((d) => d.weekday))].sort()[0] : null;
  const [pickOpen, setPickOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // A new program saved while another is running: start it or keep it (#140).
  const [justSaved, setJustSaved] = useState(null);
  const goToTraining = (openId) => navigate("/solo/home", { replace: true, state: { soloTab: "training", ...(openId ? { openPurchaseId: openId } : {}) } });
  const replacingName = soloCurrentProgram ? soloProgramsById?.[soloCurrentProgram.programId]?.name || "Your current program" : "";
  const replacingWeek =
    soloCurrentProgram?.startDate && soloCurrentProgram.startDate <= localDateKey()
      ? weekInProgram(soloCurrentProgram, Number(soloProgramsById?.[soloCurrentProgram.programId]?.weekOnePreview?.totalWeeks) || Number(soloCustomPrograms.find((c) => `cp_${c.id}` === soloCurrentProgram.programId)?.weeks) || 0, localDateKey())
      : null;

  useEffect(() => {
    // Wait for the member's plan before deciding (#137).
    if (!allowed && soloEntitlementReady) openPaywall({ tier: "plus", reason: "Turn your sessions into a multi-week program on your calendar — part of Plus." });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, soloEntitlementReady]);

  function setWeekday(id, weekday) {
    setDays((list) => list.map((d) => (d.id === id ? { ...d, weekday } : d)));
    setDayPickerFor(null);
  }

  async function save() {
    if (!allowed) {
      openPaywall({ tier: "plus", reason: "Turn your sessions into a multi-week program on your calendar — part of Plus." });
      return;
    }
    // The week Monday → Sunday, each session with its weekday; the name
    // fills itself in if they skipped it.
    const ordered = [...days].sort(byWeekday);
    const draft = {
      ...(existing || {}),
      name: name.trim() || defaultProgramName(ordered),
      weeks,
      days: ordered.map(({ weekday, ...d }) => d),
      weekdays: ordered.map((d) => d.weekday),
      startDate: startDate || null,
    };
    const problem = validateCustomProgram(draft);
    if (problem) return setError(problem);
    setError("");
    setSaving(true);
    try {
      const saved = await saveSoloCustomProgram(soloCurrentUser.id, draft);
      if (!existing) {
        // One program at a time (#140): a new program becomes the current
        // one, or — when another is running — they choose.
        const target = { programId: customProgramKey(saved.id), source: "custom", customProgramId: saved.id, id: `${soloCurrentUser.id}_${customProgramKey(saved.id)}` };
        if (soloCurrentProgram && soloCurrentProgram.programId !== target.programId) {
          setJustSaved({ target, startDate: saved.startDate });
          setSaving(false);
          return;
        }
        await switchSoloProgram({ target, startDate: saved.startDate || localDateKey() });
      }
      navigate("/solo/home", { replace: true, state: { soloTab: "training", openPurchaseId: `${soloCurrentUser.id}_${customProgramKey(saved.id)}` } });
    } catch {
      setSaving(false);
      setError("Couldn't save this program — check your connection and try again.");
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await deleteSoloCustomProgram(existing.id);
      navigate("/solo/home", { replace: true });
    } catch {
      setSaving(false);
      setError("Couldn't delete this program — check your connection and try again.");
    }
  }

  const label = (text) => (
    <p className="text-[11px] font-bold tracking-wide uppercase mt-6 mb-2" style={{ color: t.textFaint }}>
      {text}
    </p>
  );

  return (
    <div className="min-h-dvh w-full" style={{ backgroundColor: t.bg, color: t.text }}>
      <div className="w-full max-w-md mx-auto px-3 pt-5 pb-28">
        <div className="flex items-center gap-2 mb-5">
          <button onClick={() => navigate(-1)} aria-label="Back" className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={soloGlass(t)}>
            <ChevronLeft size={18} />
          </button>
          <h1 className="text-xl font-extrabold leading-tight">{existing ? "Edit program" : "Build a program"}</h1>
        </div>

        <label htmlFor="program-name" className="block text-[11px] font-bold tracking-wide uppercase mb-1.5" style={{ color: t.textFaint }}>
          Program name
        </label>
        <input
          id="program-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder={days.length ? defaultProgramName(days) : "e.g. My 6-week strength block"}
          className="w-full rounded-xl px-3.5 py-3 text-sm outline-none"
          style={{ ...soloGlass(t), color: t.text }}
        />

        {label("Length")}
        <div className="flex items-center justify-between rounded-2xl px-4 py-3" style={soloGlass(t)}>
          <p className="text-sm font-semibold">Weeks</p>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Fewer weeks" onClick={() => setWeeks((w) => Math.max(1, w - 1))} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: t.chipBg }}>
              <Minus size={14} />
            </button>
            <span className="w-8 text-center text-lg font-extrabold tabular-nums">{weeks}</span>
            <button type="button" aria-label="More weeks" onClick={() => setWeeks((w) => Math.min(MAX_PROGRAM_WEEKS, w + 1))} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: t.chipBg }}>
              <Plus size={14} />
            </button>
          </div>
        </div>

        {label(`Your week${days.length ? ` · ${days.length} session${days.length === 1 ? "" : "s"}` : ""}`)}
        {days.length === 0 ? (
          <p className="text-sm py-6 px-4 text-center rounded-2xl" style={{ ...soloGlass(t), color: t.textMuted }}>
            Add the sessions you'll do each week. We'll put them on your training days.
          </p>
        ) : (
          <>
            <div className="rounded-2xl" style={soloGlass(t)} data-testid="program-week">
              {week.map((d, i) => (
                <div key={d.id} style={i > 0 ? { borderTop: `1px solid ${t.panelBorder}` } : undefined}>
                  <div className="flex items-center gap-3 px-3.5 py-3">
                    <button
                      type="button"
                      onClick={() => setDayPickerFor((v) => (v === d.id ? null : d.id))}
                      aria-label={`Change day for ${d.label}`}
                      aria-expanded={dayPickerFor === d.id}
                      className="w-11 shrink-0 text-left text-[13px] font-bold"
                      style={{ color: accent }}
                    >
                      {WEEKDAY_SHORT[d.weekday] || "—"}
                    </button>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold truncate">{d.label}</span>
                      <span className="block text-xs" style={{ color: t.textMuted }}>
                        {(d.exercises || []).length} exercise{(d.exercises || []).length === 1 ? "" : "s"}
                      </span>
                    </span>
                    <button type="button" onClick={() => setDays((list) => list.filter((x) => x.id !== d.id))} aria-label={`Remove ${d.label}`} className="w-7 h-7 flex items-center justify-center" style={{ color: t.textMuted }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {dayPickerFor === d.id && (
                    <div className="flex justify-between gap-1 px-3.5 pb-3" role="group" aria-label={`Day for ${d.label}`}>
                      {WEEK_ORDER.map((wd) => {
                        const takenBy = days.find((x) => x.weekday === wd && x.id !== d.id);
                        const on = d.weekday === wd;
                        return (
                          <button
                            key={wd}
                            type="button"
                            disabled={!!takenBy}
                            onClick={() => setWeekday(d.id, wd)}
                            aria-pressed={on}
                            className="flex-1 h-9 rounded-full text-xs font-semibold disabled:opacity-25"
                            style={on ? { backgroundColor: accent, color: "#fff" } : { backgroundColor: t.chipBg, color: t.text }}
                          >
                            {WEEKDAY_SHORT[wd].slice(0, 2)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs mt-2 px-1" style={{ color: t.textMuted }}>
              {trainingDays.length ? "On your training days." : "Spread out so you get rest between."} Tap a day to move a session.
            </p>
          </>
        )}
        {days.length < MAX_PROGRAM_DAYS && (
          <button type="button" onClick={() => setPickOpen(true)} className="w-full flex items-center justify-center gap-2 text-sm font-semibold py-3 mt-2.5 rounded-2xl" style={{ ...soloGlass(t), color: accent }}>
            <Plus size={16} /> Add a session
          </button>
        )}

        {label("Starts")}
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-sm" data-testid="program-starts">
            {startDate === localDateKey() ? "Today" : sessionDayLabel(startDate)}
            {firstSessionKey && (
              <span style={{ color: t.textMuted }}> · first session {sessionDayLabel(firstSessionKey).replace(/^(Today|Tomorrow)$/, (m) => m.toLowerCase())}</span>
            )}
          </p>
          <button type="button" onClick={() => setDateOpen((v) => !v)} className="text-xs font-semibold shrink-0" style={{ color: accent }}>
            {dateOpen ? "Done" : "Change"}
          </button>
        </div>
        {dateOpen && (
          <input
            type="date"
            value={startDate}
            min={localDateKey()}
            onChange={(e) => setStartDate(e.target.value)}
            aria-label="Start date"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm mt-2"
            style={{ backgroundColor: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, colorScheme: dark ? "dark" : "light" }}
          />
        )}

        {error && <p className="text-sm text-red-500 text-center mt-4">{error}</p>}

        <div className="mt-6 space-y-2.5">
          <PrimaryButton dark={dark} className="w-full" onClick={save} disabled={saving}>
            {saving ? "Saving…" : existing ? "Save program" : "Create program"}
          </PrimaryButton>
          {existing &&
            (confirmDelete ? (
              <div className="flex gap-2.5">
                <SecondaryButton dark={dark} className="flex-1" onClick={() => setConfirmDelete(false)} disabled={saving}>
                  Keep it
                </SecondaryButton>
                <button type="button" onClick={remove} disabled={saving} className="flex-1 text-sm font-bold rounded-full py-3 text-white bg-red-500 disabled:opacity-50">
                  Delete program
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="w-full text-sm font-semibold py-2 text-red-500">
                Delete program
              </button>
            ))}
          <p className="text-[11px] text-center" style={{ color: t.textFaint }}>
            Deleting a program keeps every workout you've logged.
          </p>
        </div>
      </div>

      <BottomSheet open={pickOpen} onClose={() => setPickOpen(false)} title="Add a session" dark={dark}>
        {soloCustomSessions.length === 0 ? (
          <div style={{ color: t.text }}>
            <p className="text-sm mb-4" style={{ color: t.textMuted }}>
              Build a session first — then add it here.
            </p>
            <PrimaryButton dark={dark} className="w-full" onClick={() => navigate("/solo/session-builder")}>
              BUILD A SESSION
            </PrimaryButton>
          </div>
        ) : (
          <div className="rounded-2xl" style={{ ...soloGlass(t), color: t.text }}>
            {soloCustomSessions.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setDays((list) => [...list, { ...dayFromSession(s), weekday: nextWeekday(list.map((d) => d.weekday), trainingDays) }]);
                  setPickOpen(false);
                }}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                style={i > 0 ? { borderTop: `1px solid ${t.panelBorder}` } : undefined}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{s.name}</span>
                  <span className="block text-xs" style={{ color: t.textMuted }}>
                    {s.exercises.length} exercise{s.exercises.length === 1 ? "" : "s"}
                  </span>
                </span>
                <Plus size={16} color={accent} className="shrink-0" />
              </button>
            ))}
          </div>
        )}
      </BottomSheet>
      <SwitchProgramSheet
        open={!!justSaved}
        onClose={() => goToTraining(null)}
        programName={name.trim()}
        defaultStartDate={justSaved?.startDate}
        current={justSaved ? { name: replacingName, week: replacingWeek } : null}
        onConfirm={async (date) => {
          await switchSoloProgram({ target: justSaved.target, startDate: date });
          goToTraining(justSaved.target.id);
        }}
        onLater={async () => {
          await keepSoloProgramForLater(justSaved.target.programId);
          goToTraining(null);
        }}
        dark={dark}
        t={t}
      />
    </div>
  );
}
