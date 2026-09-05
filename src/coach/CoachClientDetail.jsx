import React, { useMemo, useRef, useState } from "react";
import { useApp, getCurrentPhase, programPhases } from "../lib/AppContext";
import { countExercises, estimateWorkoutMinutes } from "../lib/workoutStats";
import { Pill, TextInput, TextArea, Select, PrimaryButton, SecondaryButton, DangerButton, Avatar, BottomSheet, FullScreenOverlay } from "../components/ui";
import { DEFAULT_NUTRITION_TARGETS, macroGrams, adjustMacroPct } from "../lib/nutritionTargets";
import { computePerformanceTimeline, computePRsInLastNDays, computeWeeklySessionCompletion, closestWeighIn } from "../lib/trainingStats";
import { ThreadView } from "./CoachMessages";
import { SendLoginSheet } from "./CoachClients";
import WorkoutEditor from "./WorkoutEditor";
import {
  ArrowLeft,
  MessageCircle,
  Send,
  ClipboardList,
  Utensils,
  Image as ImageIcon,
  ListChecks,
  Plus,
  Copy,
  Trash2,
  Calendar,
  Edit3,
  X,
  Library,
  Dumbbell,
  NotebookPen,
  ChevronRight,
  Scale,
  MailCheck,
  LayoutGrid,
  Repeat,
  ChevronDown,
  User,
  Target,
  CalendarPlus,
  Clock,
  CheckCircle2,
  Check,
  Lock,
  Unlock,
} from "lucide-react";

const todayKey = () => new Date().toISOString().slice(0, 10);

function addDaysISO(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const PHASE_DURATION_OPTIONS = [1, 2, 3, 4, 5];

function emptyPhase(programs) {
  const t = todayKey();
  return {
    name: "New Phase",
    level: "Intermediate",
    description: "",
    startDate: t,
    endDate: addDaysISO(t, 4 * 7 - 1),
    duration: 4,
    templateId: "",
  };
}

function NewPhaseSheet({ open, onClose, programs, onCreate }) {
  const [form, setForm] = useState(emptyPhase(programs));

  function reset() {
    setForm(emptyPhase(programs));
  }

  function setDuration(weeks) {
    setForm((f) => ({ ...f, duration: weeks, endDate: addDaysISO(f.startDate, weeks * 7 - 1) }));
  }

  function setStartDate(value) {
    setForm((f) => ({ ...f, startDate: value, endDate: f.duration ? addDaysISO(value, f.duration * 7 - 1) : f.endDate }));
  }

  function setEndDate(value) {
    setForm((f) => ({ ...f, endDate: value, duration: null }));
  }

  function submit(e) {
    e.preventDefault();
    const template = programs.find((p) => p.id === form.templateId);
    // A program template can carry several training phases of its own now
    // (Stabilisation, Hypertrophy, Strength, etc.) — starting a client's
    // phase from one just takes the template's first phase as the starting
    // point; the coach can build out further phases from there the same
    // way as any other client phase (duplicate & schedule).
    const templateDays = template ? programPhases(template)[0]?.days || [] : [];
    onCreate({
      name: form.name.trim() || "New Phase",
      level: form.level,
      description: form.description,
      startDate: form.startDate,
      endDate: form.endDate,
      weeks: [{ id: "w1", label: "Week 1", days: JSON.parse(JSON.stringify(templateDays)) }],
    });
    reset();
    onClose();
  }

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="New Phase"
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <p className="text-black/40 text-xs tracking-wide mb-1.5">PHASE NAME</p>
          <TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Week 1-4 Stabilisation" />
        </div>
        <div>
          <p className="text-black/40 text-xs tracking-wide mb-1.5">DURATION</p>
          <div className="flex gap-2 flex-wrap">
            {PHASE_DURATION_OPTIONS.map((w) => (
              <button
                type="button"
                key={w}
                onClick={() => setDuration(w)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  form.duration === w ? "bg-black text-white" : "bg-black/8 text-black/60"
                }`}
              >
                {w} week{w > 1 ? "s" : ""}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, duration: null }))}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                !form.duration ? "bg-black text-white" : "bg-black/8 text-black/40"
              }`}
            >
              Custom
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-black/40 text-xs tracking-wide mb-1.5">START DATE</p>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-black/8 border border-black/10 rounded-xl px-3.5 py-2.5 text-black text-sm outline-none"
            />
          </div>
          <div>
            <p className="text-black/40 text-xs tracking-wide mb-1.5">END DATE</p>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-black/8 border border-black/10 rounded-xl px-3.5 py-2.5 text-black text-sm outline-none"
            />
          </div>
        </div>
        <div>
          <p className="text-black/40 text-xs tracking-wide mb-1.5">START FROM A TEMPLATE (OPTIONAL)</p>
          <Select value={form.templateId} onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}>
            <option value="">— Start blank —</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <PrimaryButton type="submit" className="w-full">
          <Plus size={16} /> CREATE PHASE
        </PrimaryButton>
      </form>
    </BottomSheet>
  );
}

function DuplicatePhaseSheet({ open, onClose, phase, onDuplicate }) {
  const [form, setForm] = useState(null);

  React.useEffect(() => {
    if (phase) {
      const start = new Date(phase.startDate);
      const end = phase.endDate ? new Date(phase.endDate) : null;
      const spanDays = end ? Math.round((end - start) / 86400000) : 27;
      // Default to picking up right where the original phase leaves off —
      // this is almost always used to line up the client's next phase —
      // rather than today, which would leave a gap or an overlap.
      const newStart = end ? new Date(end) : new Date();
      if (end) newStart.setDate(newStart.getDate() + 1);
      const weeks = Math.max(1, Math.round(spanDays / 7));
      const newEnd = new Date(newStart);
      newEnd.setDate(newEnd.getDate() + weeks * 7);
      setForm({
        name: `${phase.name} (copy)`,
        startDate: newStart.toISOString().slice(0, 10),
        endDate: newEnd.toISOString().slice(0, 10),
        weeks,
      });
    }
  }, [phase]);

  if (!phase || !form) return null;

  function setStartDate(startDate) {
    setForm((f) => {
      const newEnd = new Date(startDate);
      newEnd.setDate(newEnd.getDate() + f.weeks * 7);
      return { ...f, startDate, endDate: newEnd.toISOString().slice(0, 10) };
    });
  }

  function setWeeks(weeks) {
    setForm((f) => {
      const newEnd = new Date(f.startDate);
      newEnd.setDate(newEnd.getDate() + weeks * 7);
      return { ...f, weeks, endDate: newEnd.toISOString().slice(0, 10) };
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Duplicate & Schedule Phase">
      <p className="text-black/50 text-sm mb-4">
        Makes a full copy of "{phase.name}" with its own workouts, ready to tweak — set when it should run.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // form.weeks is only used locally to drive the duration stepper —
          // it must never reach the phase document itself, which already
          // has its own unrelated `weeks` field holding the actual workout
          // days, or duplicating a phase would wipe them out.
          onDuplicate({ name: form.name, startDate: form.startDate, endDate: form.endDate });
        }}
        className="space-y-4"
      >
        <div>
          <p className="text-black/40 text-xs tracking-wide mb-1.5">NEW PHASE NAME</p>
          <TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <p className="text-black/40 text-xs tracking-wide mb-1.5">START DATE</p>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-black/8 border border-black/10 rounded-xl px-3.5 py-2.5 text-black text-sm outline-none"
          />
        </div>
        <div>
          <p className="text-black/40 text-xs tracking-wide mb-1.5">DURATION</p>
          <div className="flex items-center bg-black/8 border border-black/10 rounded-xl">
            <button
              type="button"
              onClick={() => setWeeks(Math.max(1, form.weeks - 1))}
              className="w-11 h-11 flex items-center justify-center text-black/50 text-lg"
              aria-label="Decrease duration"
            >
              −
            </button>
            <span className="flex-1 text-center text-black text-sm font-semibold">
              {form.weeks} week{form.weeks === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => setWeeks(form.weeks + 1)}
              className="w-11 h-11 flex items-center justify-center text-black/50 text-lg"
              aria-label="Increase duration"
            >
              +
            </button>
          </div>
          <p className="text-black/30 text-xs mt-1.5">Ends {new Date(form.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
        </div>
        <PrimaryButton type="submit" className="w-full">
          <Copy size={16} /> DUPLICATE & SCHEDULE
        </PrimaryButton>
      </form>
    </BottomSheet>
  );
}

const CAL_WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// The real muscle-group categories exercises are tagged with (excludes
// Warm-up/Cool-down/Full Body/Cardio, which aren't a "muscle" a coach would
// track as trained-or-avoided).
const MUSCLE_CATEGORIES = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Legs", "Core", "Forearms"];

function dKey(d) {
  return d.toISOString().slice(0, 10);
}

// A 6-week grid (Mon-first) covering the given UTC month, including the
// padding days from the previous/next month needed to fill whole weeks.
function buildMonthGrid(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const startOffset = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, month, 1 - startOffset));
  const weeks = [];
  let cursor = start;
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      week.push(cursor);
      cursor = new Date(cursor.getTime() + 86400000);
    }
    weeks.push(week);
  }
  return weeks;
}

// Click-to-circle date grid — pick any number of specific dates in one
// pass, the same interaction as the source layout's scheduling popover.
// Renders in the client's local month; navigable and reusable at a
// compact size inside a sheet.
function MiniDatePicker({ selectedDates, onToggle, viewYear, viewMonth, onShiftMonth }) {
  const weeks = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const todayStr = dKey(new Date());
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => onShiftMonth(-1)}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-black/8 hover:bg-black/15 text-black/60"
        >
          <ChevronRight size={13} className="rotate-180" />
        </button>
        <p className="text-black text-sm font-semibold">
          {new Date(Date.UTC(viewYear, viewMonth, 1)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}
        </p>
        <button
          type="button"
          onClick={() => onShiftMonth(1)}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-black/8 hover:bg-black/15 text-black/60"
        >
          <ChevronRight size={13} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {CAL_WEEKDAY_LABELS.map((l) => (
          <p key={l} className="text-black/30 text-[9px] font-semibold text-center tracking-wide">
            {l[0]}
          </p>
        ))}
      </div>
      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((date) => {
              const dateStr = dKey(date);
              const inMonth = date.getUTCMonth() === viewMonth;
              const isToday = dateStr === todayStr;
              const selected = selectedDates.has(dateStr);
              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => onToggle(dateStr)}
                  className={`aspect-square rounded-full text-xs font-medium transition-colors ${
                    selected
                      ? "bg-blue-500 text-white"
                      : isToday
                      ? "border border-blue-400 text-black"
                      : inMonth
                      ? "text-black/70 hover:bg-black/8"
                      : "text-black/20"
                  }`}
                >
                  {date.getUTCDate()}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScheduleWorkoutSheet({ open, onClose, client, initialDate, showToast, presetPayload }) {
  const { db, scheduleWorkoutDates } = useApp();
  const [source, setSource] = useState("library"); // library | custom
  const [masterWorkoutId, setMasterWorkoutId] = useState("");
  const [customDay, setCustomDay] = useState(null); // built via WorkoutEditor
  const [editingCustom, setEditingCustom] = useState(false);
  const [selectedDates, setSelectedDates] = useState(() => new Set());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [weeklyWeekday, setWeeklyWeekday] = useState(null); // 0=Mon..6=Sun, or null
  const [weeklyWeeks, setWeeklyWeeks] = useState(4);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open) {
      const base = initialDate ? new Date(initialDate + "T00:00:00Z") : new Date();
      setSource("library");
      setMasterWorkoutId(db.masterWorkouts?.[0]?.id || "");
      setCustomDay(null);
      setSelectedDates(new Set(initialDate ? [initialDate] : []));
      setViewYear(base.getUTCFullYear());
      setViewMonth(base.getUTCMonth());
      setWeeklyWeekday(null);
      setWeeklyWeeks(4);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDate]);

  function shiftMonth(delta) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  function toggleDate(dateStr) {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  }

  // Quick-add convenience: fill in every occurrence of a chosen weekday for
  // the next N weeks, starting from today — still just adds circles to the
  // same set, so any of them can be individually removed afterward.
  function applyWeeklyPattern() {
    if (weeklyWeekday === null) return;
    const dates = [];
    const d = new Date();
    // advance to the first matching weekday (Mon=0..Sun=6)
    while ((d.getDay() + 6) % 7 !== weeklyWeekday) d.setDate(d.getDate() + 1);
    for (let i = 0; i < weeklyWeeks; i++) {
      dates.push(dKey(d));
      d.setDate(d.getDate() + 7);
    }
    setSelectedDates((prev) => new Set([...prev, ...dates]));
  }

  const selectedMaster = (db.masterWorkouts || []).find((w) => w.id === masterWorkoutId);
  const payload =
    presetPayload ||
    (source === "library"
      ? selectedMaster
        ? { label: selectedMaster.label, muscleGroups: selectedMaster.muscleGroups || [], exercises: selectedMaster.exercises }
        : null
      : customDay
      ? { label: customDay.label, muscleGroups: customDay.muscleGroups || [], exercises: customDay.exercises }
      : null);

  async function submit(e) {
    e.preventDefault();
    if (!payload || selectedDates.size === 0) return;
    setSaving(true);
    try {
      const dates = [...selectedDates].sort();
      await scheduleWorkoutDates(client.id, { dates, ...payload });
      showToast(`Scheduled on ${dates.length} date${dates.length === 1 ? "" : "s"}`);
      onClose();
    } catch (err) {
      showToast(err.message || "Couldn't schedule that workout");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Schedule a Workout">
      <form onSubmit={submit} className="space-y-4">
        {presetPayload ? (
          <div className="flex items-center gap-3 bg-black/[0.03] border border-black/8 rounded-xl px-4 py-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <Dumbbell size={15} className="text-blue-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-black font-semibold text-sm truncate">{presetPayload.label}</p>
              <p className="text-black/35 text-xs truncate">
                {countExercises(presetPayload.exercises)} exercise{countExercises(presetPayload.exercises) === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex bg-black/5 rounded-xl p-1">
              {[
                { id: "library", label: "From Library" },
                { id: "custom", label: "Build Custom" },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSource(s.id)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    source === s.id ? "bg-white shadow text-black" : "text-black/50"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {source === "library" ? (
              (db.masterWorkouts || []).length === 0 ? (
                <p className="text-black/30 text-sm text-center py-4">No workout templates yet — build one in Library → Workouts.</p>
              ) : (
                <Select value={masterWorkoutId} onChange={(e) => setMasterWorkoutId(e.target.value)}>
                  {db.masterWorkouts.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label} · {countExercises(w.exercises)} exercise{countExercises(w.exercises) === 1 ? "" : "s"}
                    </option>
                  ))}
                </Select>
              )
            ) : (
              <button
                type="button"
                onClick={() => setEditingCustom(true)}
                className="w-full flex items-center justify-between bg-black/[0.03] border border-dashed border-black/15 rounded-xl px-4 py-3.5 text-left"
              >
                <span className="text-black/70 text-sm">
                  {customDay ? `${customDay.label} · ${countExercises(customDay.exercises)} exercises` : "Tap to build this workout"}
                </span>
                <Edit3 size={15} className="text-black/30" />
              </button>
            )}
          </>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-black/40 text-xs tracking-wide">DATES</p>
            {selectedDates.size > 0 && (
              <button type="button" onClick={() => setSelectedDates(new Set())} className="text-black/30 text-xs font-medium hover:text-black/50">
                Clear ({selectedDates.size})
              </button>
            )}
          </div>
          <div className="bg-black/[0.03] border border-black/8 rounded-xl p-3">
            <MiniDatePicker selectedDates={selectedDates} onToggle={toggleDate} viewYear={viewYear} viewMonth={viewMonth} onShiftMonth={shiftMonth} />
          </div>
          <p className="text-black/30 text-[11px] mt-1.5">Tap any dates to circle them — pick as many as you like.</p>
        </div>

        <div className="bg-black/[0.03] rounded-xl p-3">
          <p className="text-black/40 text-xs tracking-wide mb-2">QUICK ADD: SAME WEEKDAY EVERY WEEK</p>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {CAL_WEEKDAY_LABELS.map((l, i) => (
              <button
                key={l}
                type="button"
                onClick={() => setWeeklyWeekday((v) => (v === i ? null : i))}
                className={`py-1.5 rounded-lg text-[10px] font-semibold transition-colors ${
                  weeklyWeekday === i ? "bg-blue-500 text-white" : "bg-white border border-black/10 text-black/50"
                }`}
              >
                {l[0]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={52}
              value={weeklyWeeks}
              onChange={(e) => setWeeklyWeeks(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
              className="w-16 bg-white border border-black/10 rounded-lg px-2 py-1.5 text-black text-sm outline-none text-center"
            />
            <span className="text-black/40 text-xs flex-1">weeks, starting this week</span>
            <button
              type="button"
              disabled={weeklyWeekday === null}
              onClick={applyWeeklyPattern}
              className="bg-black text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-30"
            >
              Add
            </button>
          </div>
        </div>

        <PrimaryButton type="submit" className="w-full" disabled={!payload || selectedDates.size === 0 || saving}>
          <Calendar size={16} />
          {saving ? "SCHEDULING…" : `SCHEDULE${selectedDates.size > 0 ? ` (${selectedDates.size})` : ""}`}
        </PrimaryButton>
      </form>

      {editingCustom && (
        <WorkoutEditor
          open={editingCustom}
          day={customDay || { id: "custom", label: "Custom Workout", muscleGroups: [], exercises: [] }}
          exercises={db.exercises}
          onClose={() => setEditingCustom(false)}
          onSave={(day) => {
            setCustomDay(day);
            setEditingCustom(false);
          }}
          showToast={showToast}
        />
      )}
    </BottomSheet>
  );
}

function ScheduleBodyStatsSheet({ open, onClose, client, initialDate, showToast }) {
  const { scheduleBodyStatsCheckin } = useApp();
  const [date, setDate] = useState(initialDate || dKey(new Date()));
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [weeks, setWeeks] = useState(4);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open) {
      setDate(initialDate || dKey(new Date()));
      setRepeatWeekly(false);
      setWeeks(4);
    }
  }, [open, initialDate]);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await scheduleBodyStatsCheckin(client.id, { startDate: date, weeks: repeatWeekly ? weeks : 1 });
      showToast("Body stats check-in scheduled");
      onClose();
    } catch (err) {
      showToast(err.message || "Couldn't schedule that check-in");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Schedule a Body Stats Check-in">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-black/50 text-sm">Reminds the client to log their weight that day — it shows up on their Progress graph automatically once they do.</p>
        <div>
          <p className="text-black/40 text-xs tracking-wide mb-1.5">DATE</p>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-black/8 border border-black/10 rounded-xl px-3.5 py-2.5 text-black text-sm outline-none"
          />
        </div>
        <div className="flex items-center justify-between bg-black/[0.03] rounded-xl px-3.5 py-2.5">
          <span className="text-black/70 text-sm font-medium">Repeat weekly</span>
          <button
            type="button"
            onClick={() => setRepeatWeekly((v) => !v)}
            className={`w-11 h-6 rounded-full relative transition-colors ${repeatWeekly ? "bg-blue-500" : "bg-black/15"}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${repeatWeekly ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
        {repeatWeekly && (
          <div>
            <p className="text-black/40 text-xs tracking-wide mb-1.5">FOR HOW MANY WEEKS (UP TO 52)</p>
            <input
              type="number"
              min={1}
              max={52}
              value={weeks}
              onChange={(e) => setWeeks(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
              className="w-full bg-black/8 border border-black/10 rounded-xl px-3.5 py-2.5 text-black text-sm outline-none"
            />
          </div>
        )}
        <PrimaryButton type="submit" className="w-full" disabled={saving}>
          <Scale size={16} /> {saving ? "SCHEDULING…" : "SCHEDULE CHECK-IN"}
        </PrimaryButton>
      </form>
    </BottomSheet>
  );
}

function DayDetailSheet({ date, client, items, exercisesById, onClose, onSchedule, onRemoveWorkout, onRemoveBodyStats }) {
  const [expandedLog, setExpandedLog] = useState(null);
  if (!date) return null;
  const label = new Date(date + "T00:00:00Z").toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <BottomSheet open={!!date} onClose={onClose} title={label}>
      {items.length === 0 ? (
        <p className="text-black/30 text-sm text-center py-4">Nothing scheduled for this day yet.</p>
      ) : (
        <div className="space-y-2 mb-4">
          {items.map((it, i) => {
            const clickable = it.type === "workout" && it.done && it.log;
            return (
              <div key={i}>
                <div
                  onClick={clickable ? () => setExpandedLog((cur) => (cur === it.log ? null : it.log)) : undefined}
                  className={`flex items-center gap-3 bg-black/[0.03] border border-black/8 rounded-xl px-3.5 py-3 ${clickable ? "cursor-pointer hover:bg-black/[0.05]" : ""}`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      it.type === "workout"
                        ? it.done
                          ? "bg-emerald-50 border border-emerald-100"
                          : "bg-blue-50 border border-blue-100"
                        : it.type === "bodystats"
                        ? "bg-amber-50 border border-amber-100"
                        : it.type === "habits"
                        ? "bg-purple-50 border border-purple-100"
                        : it.type === "nutrition"
                        ? "bg-rose-50 border border-rose-100"
                        : "bg-emerald-50 border border-emerald-100"
                    }`}
                  >
                    {it.type === "workout" &&
                      (it.done ? <CheckCircle2 size={15} className="text-emerald-600" /> : <Dumbbell size={15} className="text-blue-500" />)}
                    {it.type === "bodystats" && <Scale size={15} className="text-amber-600" />}
                    {it.type === "form" && <NotebookPen size={15} className="text-emerald-600" />}
                    {it.type === "habits" && <ListChecks size={15} className="text-purple-600" />}
                    {it.type === "nutrition" && <Utensils size={15} className="text-rose-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-black text-sm font-medium truncate">{it.label}</p>
                    <p className="text-black/35 text-xs">
                      {it.type === "workout"
                        ? it.done
                          ? "Workout · completed (tap to view)"
                          : "Workout · scheduled"
                        : it.type === "bodystats"
                        ? it.done
                          ? "Body stats · logged"
                          : "Body stats · pending"
                        : it.type === "habits"
                        ? it.done
                          ? "Habit · done"
                          : "Habit · not yet done"
                        : it.type === "nutrition"
                        ? `${Math.round(it.nutrition.protein)}g protein · ${Math.round(it.nutrition.carbs)}g carbs · ${Math.round(it.nutrition.fat)}g fat`
                        : "Check-in form"}
                    </p>
                  </div>
                  {it.type === "workout" && !it.done && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveWorkout();
                      }}
                      className="w-7 h-7 flex items-center justify-center text-black/30 hover:text-black/60"
                    >
                      <X size={14} />
                    </button>
                  )}
                  {it.type === "bodystats" && (
                    <button onClick={onRemoveBodyStats} className="w-7 h-7 flex items-center justify-center text-black/30 hover:text-black/60">
                      <X size={14} />
                    </button>
                  )}
                </div>
                {clickable && expandedLog === it.log && (
                  <div className="mt-2">
                    <WorkoutLogCard log={it.log} exercisesById={exercisesById} defaultOpen />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2">
        <button
          onClick={() => onSchedule("workout")}
          className="flex items-center justify-center gap-2 bg-black/8 hover:bg-black/15 text-black text-sm font-semibold py-2.5 rounded-xl transition-colors"
        >
          <Dumbbell size={15} /> Schedule a Workout
        </button>
        <button
          onClick={() => onSchedule("bodystats")}
          className="flex items-center justify-center gap-2 bg-black/8 hover:bg-black/15 text-black text-sm font-semibold py-2.5 rounded-xl transition-colors"
        >
          <Scale size={15} /> Schedule Body Stats Check-in
        </button>
        <button
          onClick={() => onSchedule("form")}
          className="flex items-center justify-center gap-2 bg-black/8 hover:bg-black/15 text-black text-sm font-semibold py-2.5 rounded-xl transition-colors"
        >
          <NotebookPen size={15} /> Schedule a Check-in Form
        </button>
      </div>
    </BottomSheet>
  );
}

const DELETE_CATEGORIES = [
  { key: "workout", label: "Workouts" },
  { key: "habits", label: "Habits" },
  { key: "cardio", label: "Cardio" },
];

function CalendarPanel({ client, showToast }) {
  const { db, scheduleWorkout, unscheduleWorkout, scheduleBodyStatsCheckin, unscheduleBodyStatsCheckin, deleteWorkoutLog, removeHabit } = useApp();
  // Built on Pointer Events rather than the HTML5 drag-and-drop API — that
  // API is mouse-only and never fires from a touch gesture, which is why
  // this didn't work at all on a phone. Pointer Events cover mouse and
  // touch identically: press and hold briefly (so an ordinary tap/scroll
  // isn't mistaken for a drag), then move to the target day and release.
  const [dragItem, setDragItem] = useState(null); // { date, type, label } — the item's own date + which kind, while dragging it
  const [dragOverDate, setDragOverDate] = useState(null);
  const [dragPos, setDragPos] = useState(null); // { x, y } — pointer position while actively dragging, drives the floating ghost
  const pressRef = useRef(null); // { timer, startX, startY, date, type, label, fired }
  // A completed drag still ends in a native "click" on the same element
  // (pointer capture keeps the up-event's target pinned to it regardless of
  // where the finger ended up) — without this flag that click immediately
  // reopened the day detail sheet right after dropping the item.
  const suppressClickRef = useRef(false);

  function itemPointerDown(e, dateStr, type, label) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    const timer = setTimeout(() => {
      if (!pressRef.current) return;
      pressRef.current.fired = true;
      setDragItem({ date: dateStr, type, label });
      setDragPos({ x: startX, y: startY });
      try {
        el.setPointerCapture(pointerId);
      } catch {}
      if (navigator.vibrate) navigator.vibrate(10);
    }, 300);
    pressRef.current = { timer, startX, startY, date: dateStr, type, label, fired: false };
  }

  function itemPointerMove(e) {
    const p = pressRef.current;
    if (!p) return;
    if (!p.fired) {
      if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 10) {
        clearTimeout(p.timer);
        pressRef.current = null;
      }
      return;
    }
    setDragPos({ x: e.clientX, y: e.clientY });
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const dayEl = target?.closest("[data-date]");
    const overDate = dayEl?.getAttribute("data-date") || null;
    setDragOverDate(overDate && overDate !== p.date ? overDate : null);
  }

  function itemPointerUp() {
    const p = pressRef.current;
    if (p?.fired) {
      suppressClickRef.current = true;
      if (dragOverDate && dragOverDate !== p.date) {
        if (p.type === "workout") moveWorkout(p.date, dragOverDate);
        else if (p.type === "bodystats") moveBodyStats(p.date, dragOverDate);
      }
    }
    if (p?.timer) clearTimeout(p.timer);
    pressRef.current = null;
    setDragItem(null);
    setDragOverDate(null);
    setDragPos(null);
  }
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(now.getUTCMonth());
  const [selectedDate, setSelectedDate] = useState(null);
  const [scheduleKind, setScheduleKind] = useState(null); // "workout" | "bodystats" | "form" | null
  const [selectMode, setSelectMode] = useState(false);
  const [activeCategories, setActiveCategories] = useState(() => new Set(["workout", "habits", "cardio"]));
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");

  const scheduledWorkouts = (db.scheduledWorkouts || {})[client.id] || [];
  const bodyStatsSchedules = (db.bodyStatsSchedules || {})[client.id] || [];
  const formSchedules = (db.formSchedules || {})[client.id] || [];
  const forms = db.forms || [];
  const weighIns = (db.weighIns || {})[client.id] || [];
  const habits = (db.habits || {})[client.id] || [];
  const habitLogForClient = (db.habitLog || {})[client.id] || {};
  const workoutLogs = (db.workoutLogs || {})[client.id] || [];
  const nutritionLogs = (db.nutritionLogs || {})[client.id] || [];
  const exercisesById = useMemo(() => Object.fromEntries((db.exercises || []).map((e) => [e.id, e])), [db.exercises]);

  const workoutsByDate = useMemo(() => Object.fromEntries(scheduledWorkouts.map((w) => [w.date, w])), [scheduledWorkouts]);
  const bodyStatsByDate = useMemo(() => Object.fromEntries(bodyStatsSchedules.map((b) => [b.date, b])), [bodyStatsSchedules]);
  const weighInDates = useMemo(() => new Set(weighIns.map((w) => dKey(new Date(w.date)))), [weighIns]);
  const completedWorkoutsByDate = useMemo(() => {
    const map = {};
    workoutLogs.forEach((log) => {
      const key = dKey(new Date(log.date));
      if (!map[key]) map[key] = log;
    });
    return map;
  }, [workoutLogs]);
  const nutritionByDate = useMemo(() => {
    const map = {};
    nutritionLogs.forEach((log) => {
      if (log.calories > 0 || log.protein > 0 || log.carbs > 0 || log.fat > 0 || log.water > 0) map[log.date] = log;
    });
    return map;
  }, [nutritionLogs]);
  const activeFormSchedules = useMemo(() => formSchedules.filter((s) => s.active), [formSchedules]);
  const formsById = useMemo(() => Object.fromEntries(forms.map((f) => [f.id, f])), [forms]);

  const weeks = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const todayStr = dKey(now);

  // Relative training volume per muscle group over a trailing 2-week
  // window (not tied to whatever month is being viewed) — sorted lowest
  // first, so the groups lagging behind the rest surface at a glance
  // rather than a flat "trained / not trained" toggle.
  const muscleBalance = useMemo(() => {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 13);
    const sinceKey = dKey(since);
    const counts = Object.fromEntries(MUSCLE_CATEGORIES.map((c) => [c, 0]));
    workoutLogs.forEach((log) => {
      const key = dKey(new Date(log.date));
      if (key < sinceKey || key > todayStr) return;
      (log.entries || []).forEach((e) => {
        const category = exercisesById[e.exerciseId]?.category;
        if (category && counts[category] !== undefined) counts[category] += (e.sets || []).length;
      });
    });
    const max = Math.max(1, ...Object.values(counts));
    return MUSCLE_CATEGORIES.map((c) => ({ category: c, sets: counts[c], pct: Math.max(4, Math.round((counts[c] / max) * 100)) })).sort(
      (a, b) => a.sets - b.sets
    );
  }, [workoutLogs, exercisesById, todayStr]);

  function itemsForDate(date) {
    const dateStr = dKey(date);
    const items = [];
    const completedLog = completedWorkoutsByDate[dateStr];
    const w = workoutsByDate[dateStr];
    if (w) {
      items.push({
        type: "workout",
        label: w.label,
        done: !!completedLog,
        log: completedLog,
        category: completedLog?.cardio ? "cardio" : "workout",
        key: completedLog ? `log:${completedLog.id}` : `sched:${dateStr}`,
      });
    } else if (completedLog) {
      items.push({
        type: "workout",
        label: completedLog.dayLabel || "Workout Completed",
        done: true,
        log: completedLog,
        category: completedLog.cardio ? "cardio" : "workout",
        key: `log:${completedLog.id}`,
      });
    }
    const b = bodyStatsByDate[dateStr];
    if (b) items.push({ type: "bodystats", label: "Track Body Stats", done: weighInDates.has(dateStr), key: `bodystats:${dateStr}` });
    activeFormSchedules
      .filter((s) => s.dayOfWeek === date.getUTCDay())
      .forEach((s) => items.push({ type: "form", label: formsById[s.formId]?.name || "Check-in" }));
    // One item per habit actually active that day (from when it was added
    // through its duration limit, if it has one) — showing the real habit
    // name rather than a vague "Daily Habits" aggregate also makes a
    // habit's scheduled window visible on the calendar itself: it simply
    // stops appearing on days past its end. Completion only applies to
    // today/past days, never a fake "due" state for future dates.
    const isPastOrToday = dateStr <= todayStr;
    const completedIds = isPastOrToday ? habitLogForClient[dateStr] || [] : [];
    habits
      .filter((h) => {
        const createdKey = dKey(new Date(h.createdAt));
        if (dateStr < createdKey) return false;
        if (h.endsAt && dateStr > dKey(new Date(h.endsAt))) return false;
        return true;
      })
      .forEach((h) => {
        items.push({
          type: "habits",
          label: h.label,
          done: isPastOrToday && completedIds.includes(h.id),
          category: "habits",
          key: `habit:${h.id}`,
          habitId: h.id,
        });
      });
    const nutrition = nutritionByDate[dateStr];
    if (nutrition) items.push({ type: "nutrition", label: `${Math.round(nutrition.calories)} kcal logged`, nutrition });
    return items;
  }

  function goToday() {
    setViewYear(now.getUTCFullYear());
    setViewMonth(now.getUTCMonth());
  }

  function shiftMonth(delta) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  function toggleCategory(key) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectedKey(item) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(item.key)) next.delete(item.key);
      else next.add(item.key);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedKeys(new Set());
    setRangeStart("");
    setRangeEnd("");
  }

  // Selects every item that matches the active category filters between
  // two dates in one go, so cleaning up a stretch of weeks/months doesn't
  // mean clicking each item on the calendar one at a time.
  function selectDateRange() {
    if (!rangeStart || !rangeEnd) return;
    const start = new Date(rangeStart + "T00:00:00Z");
    const end = new Date(rangeEnd + "T00:00:00Z");
    if (start > end) {
      showToast("Start date must be before the end date");
      return;
    }
    if ((end - start) / 86400000 > 366) {
      showToast("Pick a range of a year or less");
      return;
    }
    const keys = new Set(selectedKeys);
    const cursor = new Date(start);
    while (cursor <= end) {
      itemsForDate(cursor).forEach((it) => {
        if (it.category && activeCategories.has(it.category)) keys.add(it.key);
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    setSelectedKeys(keys);
    showToast(`Selected ${keys.size} item${keys.size === 1 ? "" : "s"} in that range`);
  }

  function deleteSelected() {
    selectedKeys.forEach((key) => {
      if (key.startsWith("log:")) deleteWorkoutLog(key.slice(4));
      else if (key.startsWith("sched:")) unscheduleWorkout(client.id, key.slice(6));
      else if (key.startsWith("habit:")) removeHabit(client.id, key.slice(6));
    });
    showToast(`Deleted ${selectedKeys.size} item${selectedKeys.size === 1 ? "" : "s"}`);
    exitSelectMode();
  }

  // Drag a not-yet-completed scheduled workout onto a different day to
  // move it there — e.g. the client asks to swap Monday's session to
  // Wednesday. Dropping onto a day that already has a different workout
  // used to just overwrite it (both docs share the same clientId__date
  // id, so scheduling on an occupied day silently destroyed whatever was
  // there) — now the two swap places instead, so nothing is lost.
  async function moveWorkout(fromDate, toDate) {
    if (fromDate === toDate) return;
    const entry = workoutsByDate[fromDate];
    if (!entry) return;
    const destEntry = workoutsByDate[toDate];
    const label = (d) => new Date(d + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
    try {
      await scheduleWorkout(client.id, { date: toDate, label: entry.label, muscleGroups: entry.muscleGroups, exercises: entry.exercises });
      if (destEntry) {
        await scheduleWorkout(client.id, { date: fromDate, label: destEntry.label, muscleGroups: destEntry.muscleGroups, exercises: destEntry.exercises });
        showToast(`Swapped ${entry.label} (${label(fromDate)}) with ${destEntry.label} (${label(toDate)})`);
      } else {
        unscheduleWorkout(client.id, fromDate);
        showToast(`Moved ${entry.label} to ${label(toDate)}`);
      }
    } catch (err) {
      showToast(err.message || "Couldn't move that workout — check your connection and try again");
    }
  }

  // Same drag-to-reschedule for a not-yet-completed body stats check-in
  // reminder — dropping onto an occupied day just replaces it, same as workouts.
  async function moveBodyStats(fromDate, toDate) {
    if (fromDate === toDate) return;
    if (!bodyStatsByDate[fromDate]) return;
    try {
      await scheduleBodyStatsCheckin(client.id, { startDate: toDate, weeks: 1 });
      unscheduleBodyStatsCheckin(client.id, fromDate);
      showToast(`Moved body stats check-in to ${new Date(toDate + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}`);
    } catch (err) {
      showToast(err.message || "Couldn't move that check-in — check your connection and try again");
    }
  }

  const selectedItems = selectedDate ? itemsForDate(new Date(selectedDate + "T00:00:00Z")) : [];
  const monthLabel = new Date(Date.UTC(viewYear, viewMonth, 1)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="px-4 py-5 md:px-6 md:py-6">
      <div className="bg-white border border-black/10 rounded-2xl p-4 md:p-5 shadow-sm mb-6">
        <p className="text-black font-semibold text-sm mb-0.5">Recent Training Load</p>
        <p className="text-black/40 text-[11px] mb-3">Sets logged, last 14 days — lowest first</p>
        {muscleBalance.every((m) => m.sets === 0) ? (
          <p className="text-black/30 text-xs">No sessions logged in the last 2 weeks — nothing to compare.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
            {muscleBalance.map((m, i) => (
              <div key={m.category} className="flex items-center gap-2">
                <span className={`text-xs w-16 shrink-0 truncate ${i < 2 ? "text-red-600 font-semibold" : "text-black/60 font-medium"}`}>
                  {m.category}
                </span>
                <div className="flex-1 h-2 rounded-full bg-black/[0.06] overflow-hidden">
                  <div className={`h-full rounded-full ${i < 2 ? "bg-red-400" : "bg-black/25"}`} style={{ width: `${m.pct}%` }} />
                </div>
                <span className="text-black/35 text-[11px] w-6 text-right shrink-0">{m.sets}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-black/10 rounded-2xl p-4 md:p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <button onClick={() => shiftMonth(-1)} className="w-9 h-9 flex items-center justify-center rounded-lg bg-black/8 hover:bg-black/15 text-black/60">
              <ChevronRight size={17} className="rotate-180" />
            </button>
            <p className="text-black font-bold text-lg w-48 text-center">{monthLabel}</p>
            <button onClick={() => shiftMonth(1)} className="w-9 h-9 flex items-center justify-center rounded-lg bg-black/8 hover:bg-black/15 text-black/60">
              <ChevronRight size={17} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={goToday} className="text-blue-600 hover:text-blue-700 text-sm font-semibold">
              Today
            </button>
            {selectMode ? (
              <button onClick={exitSelectMode} className="text-black/50 hover:text-black text-sm font-semibold">
                Cancel
              </button>
            ) : (
              <button
                onClick={() => setSelectMode(true)}
                aria-label="Select items to delete"
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-black/8 hover:bg-red-50 text-black/50 hover:text-red-600 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        {selectMode && (
          <div className="bg-black/[0.03] border border-black/8 rounded-xl px-3.5 py-2.5 mb-4 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                {DELETE_CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => toggleCategory(c.key)}
                    className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
                      activeCategories.has(c.key) ? "bg-black text-white" : "bg-white border border-black/10 text-black/50"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <button
                onClick={deleteSelected}
                disabled={selectedKeys.size === 0}
                className="flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-30"
              >
                <Trash2 size={13} /> Delete {selectedKeys.size > 0 ? `(${selectedKeys.size})` : ""}
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap border-t border-black/8 pt-2.5">
              <span className="text-black/40 text-[11px] font-semibold shrink-0">SELECT A DATE RANGE</span>
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className="bg-white border border-black/10 rounded-lg text-xs text-black px-2 py-1.5 outline-none"
              />
              <span className="text-black/30 text-xs">to</span>
              <input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="bg-white border border-black/10 rounded-lg text-xs text-black px-2 py-1.5 outline-none"
              />
              <button
                onClick={selectDateRange}
                disabled={!rangeStart || !rangeEnd}
                className="bg-black/8 hover:bg-black/15 text-black text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-30"
              >
                Select range
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-7 border-b border-black/10 pb-2 mb-1">
          {CAL_WEEKDAY_LABELS.map((l) => (
            <p key={l} className="text-black/35 text-xs font-semibold text-center tracking-wide font-sans">
              {l}
            </p>
          ))}
        </div>

        {/* seamless table — cells share border lines instead of each
            being its own boxed card, matching Trainerize's calendar */}
        <div className="border-l border-t border-black/10">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((date) => {
                const dateStr = dKey(date);
                const inMonth = date.getUTCMonth() === viewMonth;
                const isToday = dateStr === todayStr;
                const items = itemsForDate(date);
                return (
                  <div
                    key={dateStr}
                    data-date={dateStr}
                    onClick={
                      !selectMode
                        ? () => {
                            if (suppressClickRef.current) {
                              suppressClickRef.current = false;
                              return;
                            }
                            setSelectedDate(dateStr);
                          }
                        : undefined
                    }
                    className={`min-h-[104px] md:min-h-[130px] border-r border-b border-black/10 text-left px-2 py-1.5 transition-colors duration-150 font-sans ${
                      inMonth ? "bg-white" : "bg-black/[0.015]"
                    } ${!selectMode ? "cursor-pointer hover:bg-black/[0.02]" : ""} ${
                      dragOverDate === dateStr ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : ""
                    }`}
                  >
                    <div className="flex justify-end">
                      <span className={`text-xs font-semibold ${isToday ? "text-blue-600" : inMonth ? "text-black/60" : "text-black/25"}`}>
                        {date.getUTCDate()}
                      </span>
                    </div>
                    <div className="mt-1 space-y-1">
                      {items.slice(0, 4).map((it, i) => {
                        const dot =
                          it.type === "workout"
                            ? { border: "border-blue-500", bg: "bg-blue-500" }
                            : it.type === "bodystats"
                            ? { border: "border-amber-500", bg: "bg-amber-500" }
                            : it.type === "habits"
                            ? { border: "border-purple-500", bg: "bg-purple-500" }
                            : it.type === "nutrition"
                            ? { border: "border-rose-500", bg: "bg-rose-500" }
                            : { border: "border-emerald-500", bg: "bg-emerald-500" };
                        const selectable = selectMode && it.category && activeCategories.has(it.category);
                        const checked = selectable && selectedKeys.has(it.key);
                        // Only a not-yet-completed scheduled workout or body stats
                        // check-in can be dragged to a different day — a completed
                        // one is history, not a plan to move.
                        const draggableItem =
                          !selectMode &&
                          ((it.type === "workout" && it.key === `sched:${dateStr}`) || (it.type === "bodystats" && !it.done));
                        const dragging = dragItem?.date === dateStr && dragItem?.type === it.type;
                        return (
                          <div
                            key={i}
                            onPointerDown={draggableItem ? (e) => itemPointerDown(e, dateStr, it.type, it.label) : undefined}
                            onPointerMove={draggableItem ? itemPointerMove : undefined}
                            onPointerUp={draggableItem ? itemPointerUp : undefined}
                            onPointerCancel={draggableItem ? itemPointerUp : undefined}
                            onClick={
                              selectable
                                ? (e) => {
                                    e.stopPropagation();
                                    toggleSelectedKey(it);
                                  }
                                : undefined
                            }
                            style={draggableItem ? { touchAction: "none" } : undefined}
                            className={`flex items-center gap-1.5 text-[11px] truncate transition-all duration-150 ${
                              selectable ? "cursor-pointer" : ""
                            } ${draggableItem ? "cursor-grab active:cursor-grabbing select-none" : ""} ${
                              dragging ? "opacity-30 scale-[0.97]" : ""
                            } ${
                              checked ? "text-red-600 font-semibold" : selectMode && !selectable ? "text-black/25" : "text-black/70"
                            }`}
                          >
                            {selectable ? (
                              <span
                                className={`w-3 h-3 rounded shrink-0 border-2 flex items-center justify-center ${
                                  checked ? "bg-red-600 border-red-600" : "border-black/25 bg-white"
                                }`}
                              >
                                {checked && <Check size={9} className="text-white" strokeWidth={3} />}
                              </span>
                            ) : (
                              <span className={`w-2 h-2 rounded-full shrink-0 border-2 ${dot.border} ${it.done ? dot.bg : "bg-transparent"}`} />
                            )}
                            <span className="truncate">{it.label}</span>
                          </div>
                        );
                      })}
                      {items.length > 4 && <p className="text-black/30 text-[11px]">+{items.length - 4} more</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center flex-wrap gap-4 mt-5">
          {[
            ["border-blue-500", "Workout"],
            ["border-emerald-500", "Completed"],
            ["border-amber-500", "Body Stats"],
            ["border-purple-500", "Daily Habits"],
            ["border-rose-500", "Nutrition Logged"],
          ].map(([cls, label]) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full border-2 ${cls}`} />
              <span className="text-black/40 text-xs">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <DayDetailSheet
        date={selectedDate}
        client={client}
        items={selectedItems}
        exercisesById={exercisesById}
        onClose={() => setSelectedDate(null)}
        onSchedule={(kind) => setScheduleKind(kind)}
        onRemoveWorkout={() => {
          unscheduleWorkout(client.id, selectedDate);
          showToast("Workout removed");
        }}
        onRemoveBodyStats={() => {
          unscheduleBodyStatsCheckin(client.id, selectedDate);
          showToast("Check-in removed");
        }}
      />

      <ScheduleWorkoutSheet
        open={scheduleKind === "workout"}
        onClose={() => setScheduleKind(null)}
        client={client}
        initialDate={selectedDate}
        showToast={showToast}
      />
      <ScheduleBodyStatsSheet
        open={scheduleKind === "bodystats"}
        onClose={() => setScheduleKind(null)}
        client={client}
        initialDate={selectedDate}
        showToast={showToast}
      />
      <ScheduleFormSheet open={scheduleKind === "form"} onClose={() => setScheduleKind(null)} client={client} showToast={showToast} />

      {/* Floating "ghost" that tracks the finger/cursor once a drag has
          started — without this the dragged item just sits there dimmed,
          which reads as unresponsive rather than as an active drag.
          pointer-events-none so it never blocks the elementFromPoint()
          lookup that finds the day underneath it. */}
      {dragItem && dragPos && (
        <div
          className="fixed z-[200] pointer-events-none flex items-center gap-2 bg-black text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-2xl"
          style={{ left: dragPos.x, top: dragPos.y, transform: "translate(-50%, -130%)" }}
        >
          {dragItem.label}
        </div>
      )}
    </div>
  );
}

// An exercise counts as "stale" once it's been sitting in the program for
// a month and a half (45 days) without being touched — addedAt is stamped
// when it's added (see newRow() in WorkoutEditor.jsx) or re-stamped when
// the coach explicitly chooses to keep it. Older rows created before this
// feature existed have no addedAt at all — fall back to the phase's own
// createdAt rather than treating them as brand new.
const STALE_EXERCISE_DAYS = 45;
function exerciseAgeDays(entry, phaseCreatedAt) {
  const since = entry.addedAt || phaseCreatedAt;
  if (!since) return 0;
  return Math.floor((Date.now() - since) / 86400000);
}
function isExerciseStale(entry, phaseCreatedAt) {
  return exerciseAgeDays(entry, phaseCreatedAt) >= STALE_EXERCISE_DAYS;
}

// Read-only look at one workout day — title, est. time, exercise count and
// equipment up top (same info a client sees on their side), plus a quick
// "schedule this" shortcut so the coach doesn't have to leave the preview
// and re-find the workout in the separate Schedule sheet.
function DayPreviewSheet({ day, exercises, onClose, onSchedule, onEdit, phaseCreatedAt, onKeepExercise }) {
  const exercisesById = useMemo(() => Object.fromEntries((exercises || []).map((e) => [e.id, e])), [exercises]);
  const equipment = useMemo(() => {
    if (!day) return [];
    const set = new Set();
    day.exercises.forEach((e) => {
      const ex = exercisesById[e.exerciseId];
      if (ex?.equipment) set.add(ex.equipment);
    });
    return [...set];
  }, [day, exercisesById]);

  if (!day) return null;
  const estMinutes = estimateWorkoutMinutes(day.exercises);

  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[90] bg-white flex flex-col">
        <div className="flex items-center justify-between px-5 pt-6 pb-3 shrink-0 border-b border-black/5">
          <button onClick={onClose} className="text-black/60">
            <X size={22} />
          </button>
          <span className="text-black/70 text-sm font-semibold">Workout Preview</span>
          <div className="flex items-center gap-1">
            <button onClick={onSchedule} className="w-9 h-9 flex items-center justify-center text-black/60" aria-label="Schedule this workout">
              <CalendarPlus size={19} />
            </button>
            <button onClick={onEdit} className="w-9 h-9 flex items-center justify-center text-black/60" aria-label="Edit this workout">
              <Edit3 size={17} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-10">
          <h1 className="text-black text-2xl font-bold mt-4">{day.label}</h1>

          <div className="flex items-center gap-5 mt-4 text-black/50 text-[13px] font-medium flex-wrap">
            <span className="flex items-center gap-1.5">
              <Clock size={15} /> est. {estMinutes} min
            </span>
            <span className="flex items-center gap-1.5">
              <Dumbbell size={15} /> {countExercises(day.exercises)} exercise{countExercises(day.exercises) === 1 ? "" : "s"}
            </span>
          </div>

          {equipment.length > 0 && (
            <div className="mt-5">
              <p className="text-black/35 text-xs font-semibold tracking-wide mb-2">EQUIPMENT</p>
              <div className="flex gap-2 flex-wrap">
                {equipment.map((eq) => (
                  <span key={eq} className="bg-black/5 text-black/60 text-xs font-medium px-3 py-1.5 rounded-full">
                    {eq}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 border-t border-black/5">
            {day.exercises.map((e, i) => {
              const ex = exercisesById[e.exerciseId];
              if (!ex) return null;
              const stale = isExerciseStale(e, phaseCreatedAt);
              return (
                <div key={i} className="py-3.5 border-b border-black/5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-black font-semibold text-[15px] truncate">{ex.name}</p>
                        {e.dropSet && (
                          <span className="bg-orange-100 text-orange-600 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded shrink-0">
                            DROPSET
                          </span>
                        )}
                      </div>
                      <p className="text-black/45 text-[13px] mt-0.5">
                        {e.targetSets} sets ×{" "}
                        {e.targetType === "time" ? `${e.targetReps || 30}s` : e.targetReps === "AMRAP" ? "AMRAP" : `${e.targetReps} Repetitions`} · RIR{" "}
                        {e.targetRIR ?? 2}
                      </p>
                    </div>
                    <span className="text-black/30 text-xs shrink-0">{ex.equipment}</span>
                  </div>
                  {stale && (
                    <div className="mt-2.5 flex items-center justify-between gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                      <p className="text-amber-800 text-xs font-medium flex-1">
                        In this program {exerciseAgeDays(e, phaseCreatedAt)} days — keep it or change it?
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => onKeepExercise?.(i)}
                          className="bg-white border border-amber-200 text-amber-800 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                        >
                          Keep
                        </button>
                        <button onClick={onEdit} className="bg-amber-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg">
                          Change
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </FullScreenOverlay>
  );
}

function TrainingProgramPanel({ client, showToast }) {
  const { db, addClientPhase, updateClientPhase, deleteClientPhase, duplicateClientPhase, createProgram } = useApp();
  const phases = (db.clientPhases || {})[client.id] || [];
  const sorted = [...phases].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const [selectedPhaseId, setSelectedPhaseId] = useState(() => getCurrentPhase(phases, todayKey())?.id || sorted[0]?.id || null);
  const [newPhaseOpen, setNewPhaseOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(null);
  const [confirmDeletePhase, setConfirmDeletePhase] = useState(null);
  const [editingWorkout, setEditingWorkout] = useState(null); // { dayIndex, day } | null
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(null);
  const [schedulingDay, setSchedulingDay] = useState(null);

  const phase = phases.find((p) => p.id === selectedPhaseId) || sorted[0] || null;
  const days = phase?.weeks?.[0]?.days || [];

  function selectPhase(id) {
    setSelectedPhaseId(id);
  }

  function createPhase(data) {
    const created = addClientPhase(client.id, data);
    setSelectedPhaseId(created.id);
    showToast("Phase created");
  }

  function duplicatePhase(overrides) {
    const created = duplicateClientPhase(client.id, duplicating.id, overrides);
    if (created) {
      setSelectedPhaseId(created.id);
      showToast("Phase duplicated and scheduled");
    }
    setDuplicating(null);
  }

  // Copies this client's phase into the reusable Master Programs library —
  // a fresh program the coach can then edit and assign to any client,
  // completely independent of the client's own copy from here on.
  async function saveAsMasterProgram() {
    if (!phase || days.length === 0) {
      showToast("Add at least one workout to this phase first");
      return;
    }
    try {
      await createProgram({
        name: phase.name,
        level: phase.level || "Intermediate",
        description: phase.description || "",
        phases: [
          {
            id: `ph_${Date.now()}`,
            name: "Phase 1",
            durationWeeks: 4,
            days: JSON.parse(JSON.stringify(days)),
          },
        ],
      });
      showToast("Saved to Master Programs — find it in Library");
    } catch (err) {
      showToast(err.message || "Couldn't save that to Master Programs");
    }
  }

  function addWorkout() {
    if (!phase) return;
    const newDay = { id: `d_${Date.now()}`, label: `Workout ${days.length + 1}`, muscleGroups: [], exercises: [] };
    setEditingWorkout({ dayIndex: days.length, day: newDay });
  }

  function addWorkoutFromLibrary(masterWorkout) {
    if (!phase) return;
    // Re-stamp addedAt on every copied exercise — what matters for the
    // stale-exercise flag is when it entered THIS client's program, not
    // whatever addedAt the template happened to carry.
    const copiedExercises = JSON.parse(JSON.stringify(masterWorkout.exercises || [])).map((ex) => ({
      ...ex,
      addedAt: Date.now(),
    }));
    const newDay = {
      id: `d_${Date.now()}`,
      label: masterWorkout.label,
      muscleGroups: masterWorkout.muscleGroups || [],
      exercises: copiedExercises,
      instructions: masterWorkout.instructions || "",
    };
    setEditingWorkout({ dayIndex: days.length, day: newDay });
    setLibraryPickerOpen(false);
  }

  async function saveWorkout(day) {
    if (!phase) return;
    const nextDays = [...days];
    if (editingWorkout.dayIndex < nextDays.length) {
      nextDays[editingWorkout.dayIndex] = day;
    } else {
      nextDays.push(day);
    }
    try {
      // Keep the editor open on its own local state until the write is
      // actually confirmed — closing early (the old behavior) meant a
      // failed save looked identical to a successful one and the workout
      // just vanished next time the phase was opened.
      await updateClientPhase(client.id, phase.id, { weeks: [{ ...(phase.weeks?.[0] || { id: "w1", label: "Week 1" }), days: nextDays }] });
      setEditingWorkout(null);
      showToast("Workout saved");
    } catch (err) {
      showToast("Couldn't save that workout — check your connection and try again");
    }
  }

  // Coach chose to keep a flagged exercise as-is — resets its clock rather
  // than silently dismissing the flag, so it'll surface again in another
  // 45 days rather than never again.
  async function keepStaleExercise(dayIndex, exIndex) {
    if (!phase || dayIndex === null || !days[dayIndex]) return;
    const nextDays = days.map((d, i) =>
      i !== dayIndex ? d : { ...d, exercises: d.exercises.map((e, j) => (j !== exIndex ? e : { ...e, addedAt: Date.now() })) }
    );
    try {
      await updateClientPhase(client.id, phase.id, { weeks: [{ ...(phase.weeks?.[0] || { id: "w1", label: "Week 1" }), days: nextDays }] });
      showToast("Kept — won't flag again for another 45 days");
    } catch (err) {
      showToast("Couldn't update — check your connection and try again");
    }
  }

  async function deleteWorkout(i) {
    if (!phase) return;
    const nextDays = days.filter((_, idx) => idx !== i);
    try {
      await updateClientPhase(client.id, phase.id, { weeks: [{ ...(phase.weeks?.[0] || { id: "w1", label: "Week 1" }), days: nextDays }] });
    } catch (err) {
      showToast("Couldn't delete that workout — check your connection and try again");
    }
  }

  return (
    <div className="flex flex-col md:flex-row md:h-full min-h-0">
      {/* phase history (desktop) */}
      <div className="hidden md:flex w-72 shrink-0 border-r border-black/8 flex-col min-h-0">
        <div className="px-4 pt-5 pb-3 flex items-center justify-between">
          <p className="text-black font-semibold text-sm">Training Program</p>
          <button
            onClick={() => setNewPhaseOpen(true)}
            className="flex items-center gap-1 bg-black text-white text-xs font-bold px-2.5 py-1.5 rounded-lg"
          >
            <Plus size={13} /> ADD
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1.5">
          {sorted.length === 0 && <p className="text-black/30 text-xs px-2 py-4">No phases yet — add the first one.</p>}
          {sorted.map((p) => {
            const active = p.id === selectedPhaseId;
            const isCurrent = getCurrentPhase(phases, todayKey())?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => selectPhase(p.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${active ? "bg-black/10" : "hover:bg-black/5"}`}
              >
                <div className="flex items-center gap-1.5">
                  <p className="text-black text-sm font-medium truncate flex-1">{p.name}</p>
                  {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-black shrink-0" />}
                </div>
                <p className="text-black/35 text-[11px] mt-0.5">
                  {new Date(p.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  {p.endDate ? ` - ${new Date(p.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : ""}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* phase history (mobile) */}
      <div className="md:hidden shrink-0 border-b border-black/8 px-4 py-3">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-black font-semibold text-sm">Training Program</p>
          <button
            onClick={() => setNewPhaseOpen(true)}
            className="flex items-center gap-1 bg-black text-white text-xs font-bold px-2.5 py-1.5 rounded-lg"
          >
            <Plus size={13} /> ADD
          </button>
        </div>
        {sorted.length === 0 ? (
          <p className="text-black/30 text-xs py-1">No phases yet — add the first one.</p>
        ) : (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {sorted.map((p) => {
              const active = p.id === selectedPhaseId;
              const isCurrent = getCurrentPhase(phases, todayKey())?.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => selectPhase(p.id)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                    active ? "bg-black text-white" : "bg-black/8 text-black/60"
                  }`}
                >
                  {p.name}
                  {isCurrent && <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-white" : "bg-black"}`} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* selected phase detail */}
      <div className="flex-1 min-w-0 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
        {!phase ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <ClipboardList size={28} className="text-black/20 mb-3" />
            <p className="text-black/50 text-sm">No phase selected yet.</p>
            <button onClick={() => setNewPhaseOpen(true)} className="mt-4 bg-black text-white text-sm font-bold px-4 py-2.5 rounded-xl">
              + Add a phase
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
              <input
                value={phase.name}
                onChange={(e) => updateClientPhase(client.id, phase.id, { name: e.target.value })}
                className="bg-transparent outline-none text-black text-xl font-bold flex-1 min-w-[140px]"
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={saveAsMasterProgram}
                  className="flex items-center gap-1.5 bg-black/8 hover:bg-black/15 text-black text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                  title="Save this phase as a reusable Master Program"
                >
                  <Library size={13} /> Save to Library
                </button>
                <button
                  onClick={() => setDuplicating(phase)}
                  className="flex items-center gap-1.5 bg-black/8 hover:bg-black/15 text-black text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                >
                  <Copy size={13} /> Duplicate
                </button>
                {!confirmDeletePhase || confirmDeletePhase !== phase.id ? (
                  <button
                    onClick={() => setConfirmDeletePhase(phase.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-black/8 hover:bg-black/15 text-black/50"
                  >
                    <Trash2 size={13} />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      deleteClientPhase(client.id, phase.id);
                      setSelectedPhaseId(null);
                      setConfirmDeletePhase(null);
                      showToast("Phase deleted");
                    }}
                    className="bg-red-500/20 text-red-300 text-xs font-semibold px-3 py-2 rounded-lg"
                  >
                    Confirm delete
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 text-black/40 text-xs mb-5">
              <Calendar size={13} />
              <input
                type="date"
                value={phase.startDate}
                onChange={(e) => updateClientPhase(client.id, phase.id, { startDate: e.target.value })}
                className="bg-transparent outline-none text-black/60"
              />
              <span>-</span>
              <input
                type="date"
                value={phase.endDate || ""}
                onChange={(e) => updateClientPhase(client.id, phase.id, { endDate: e.target.value })}
                className="bg-transparent outline-none text-black/60"
              />
            </div>

            <TextArea
              rows={2}
              value={phase.description || ""}
              onChange={(e) => updateClientPhase(client.id, phase.id, { description: e.target.value })}
              placeholder="Say something about this training phase"
              className="mb-6"
            />

            <div className="flex items-center justify-between mb-3">
              <p className="text-black font-semibold text-sm">Workouts</p>
              <div className="flex items-center gap-3">
                <button onClick={() => setLibraryPickerOpen(true)} className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 text-xs font-semibold">
                  <Library size={13} /> From library
                </button>
                <button onClick={addWorkout} className="flex items-center gap-1.5 text-black/60 text-xs font-semibold">
                  <Plus size={13} /> New workout
                </button>
              </div>
            </div>

            {days.length === 0 ? (
              <div className="border border-dashed border-black/12 rounded-2xl py-10 text-center">
                <p className="text-black/30 text-sm">No workouts in this phase yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {days.map((d, i) => (
                  <button
                    key={d.id || i}
                    onClick={() => setPreviewIndex(i)}
                    className="w-full flex items-center gap-3 bg-black/[0.03] hover:bg-black/[0.06] border border-black/8 rounded-xl px-4 py-3 text-left transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-black font-medium text-sm truncate flex items-center gap-1.5">
                        {d.label}
                        {d.exercises.some((e) => isExerciseStale(e, phase?.createdAt)) && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
                            title="Has an exercise that's been in the program 45+ days"
                          />
                        )}
                      </p>
                      <p className="text-black/35 text-xs truncate">
                        est. {estimateWorkoutMinutes(d.exercises)} min · {countExercises(d.exercises)} exercise{countExercises(d.exercises) === 1 ? "" : "s"}
                        {d.muscleGroups?.length ? ` · ${d.muscleGroups.join(", ")}` : ""}
                      </p>
                    </div>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingWorkout({ dayIndex: i, day: d });
                      }}
                      className="flex items-center gap-1.5 text-black/60 hover:text-black text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-black/8 transition-colors shrink-0"
                    >
                      <Edit3 size={13} /> Edit
                    </span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setSchedulingDay(d);
                      }}
                      className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors shrink-0"
                    >
                      <CalendarPlus size={13} /> Schedule
                    </span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteWorkout(i);
                      }}
                      className="w-7 h-7 flex items-center justify-center text-black/30 hover:text-black/60 shrink-0"
                    >
                      <X size={14} />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <NewPhaseSheet open={newPhaseOpen} onClose={() => setNewPhaseOpen(false)} programs={db.programs} onCreate={createPhase} />
      <DuplicatePhaseSheet open={!!duplicating} onClose={() => setDuplicating(null)} phase={duplicating} onDuplicate={duplicatePhase} />
      <BottomSheet open={libraryPickerOpen} onClose={() => setLibraryPickerOpen(false)} title="Add from Workout Library">
        {(db.masterWorkouts || []).length === 0 ? (
          <p className="text-black/30 text-sm text-center py-6">No workout templates yet — build some in Library → Workouts.</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {(db.masterWorkouts || []).map((w) => (
              <button
                key={w.id}
                onClick={() => addWorkoutFromLibrary(w)}
                className="w-full flex items-center gap-3 bg-black/[0.03] hover:bg-black/[0.06] border border-black/8 rounded-xl px-3.5 py-3 text-left transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                  <Dumbbell size={15} className="text-blue-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-black font-semibold text-sm truncate">{w.label}</p>
                  <p className="text-black/35 text-xs truncate">
                    {countExercises(w.exercises)} exercise{countExercises(w.exercises) === 1 ? "" : "s"}
                    {w.muscleGroups?.length ? ` · ${w.muscleGroups.join(", ")}` : ""}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </BottomSheet>
      {editingWorkout && (
        <WorkoutEditor
          open={!!editingWorkout}
          day={editingWorkout.day}
          exercises={db.exercises}
          onClose={() => setEditingWorkout(null)}
          onSave={saveWorkout}
          showToast={showToast}
        />
      )}
      {previewIndex !== null && days[previewIndex] && (
        <DayPreviewSheet
          day={days[previewIndex]}
          exercises={db.exercises}
          onClose={() => setPreviewIndex(null)}
          onSchedule={() => {
            setSchedulingDay(days[previewIndex]);
            setPreviewIndex(null);
          }}
          onEdit={() => {
            setEditingWorkout({ dayIndex: previewIndex, day: days[previewIndex] });
            setPreviewIndex(null);
          }}
          phaseCreatedAt={phase?.createdAt}
          onKeepExercise={(exIndex) => keepStaleExercise(previewIndex, exIndex)}
        />
      )}
      <ScheduleWorkoutSheet
        open={!!schedulingDay}
        onClose={() => setSchedulingDay(null)}
        client={client}
        showToast={showToast}
        presetPayload={schedulingDay ? { label: schedulingDay.label, muscleGroups: schedulingDay.muscleGroups || [], exercises: schedulingDay.exercises } : null}
      />
    </div>
  );
}

const HABIT_DURATION_OPTIONS = [
  { label: "No limit", weeks: null },
  { label: "1 week", weeks: 1 },
  { label: "2 weeks", weeks: 2 },
  { label: "4 weeks", weeks: 4 },
  { label: "10 weeks", weeks: 10 },
  { label: "50 weeks", weeks: 50 },
];

function HabitsPanel({ client }) {
  const { db, addHabit, removeHabit } = useApp();
  const [label, setLabel] = useState("");
  const [durationWeeks, setDurationWeeks] = useState(null);
  const habits = (db.habits || {})[client.id] || [];
  const existingLabels = new Set(habits.map((h) => h.label.toLowerCase()));
  const presets = (db.habitPresets || []).map((p) => p.label);
  const now = Date.now();

  function submit(e) {
    e.preventDefault();
    if (!label.trim()) return;
    addHabit(client.id, label, durationWeeks);
    setLabel("");
    setDurationWeeks(null);
  }

  return (
    <div className="max-w-xl px-4 py-5 md:px-6 md:py-6">
      <p className="text-black font-semibold mb-4">Daily Habits</p>
      {habits.length > 0 && (
        <div className="space-y-1.5 mb-4">
          {habits.map((h) => {
            const expired = h.endsAt && h.endsAt < now;
            const daysLeft = h.endsAt ? Math.max(0, Math.ceil((h.endsAt - now) / 86400000)) : null;
            return (
              <div key={h.id} className="flex items-center justify-between bg-black/5 rounded-xl px-3.5 py-2.5">
                <div className="min-w-0">
                  <span className="text-black text-sm">{h.label}</span>
                  {h.endsAt && (
                    <p className={`text-[11px] mt-0.5 ${expired ? "text-red-500 font-medium" : "text-black/35"}`}>
                      {expired ? "Ended" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
                    </p>
                  )}
                </div>
                <button onClick={() => removeHabit(client.id, h.id)} className="w-7 h-7 shrink-0 flex items-center justify-center text-black/30">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <form onSubmit={submit} className="space-y-2 mb-3">
        <div className="flex gap-2">
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Stretch for 10 minutes" className="flex-1" />
          <button type="submit" className="w-11 h-11 shrink-0 rounded-xl bg-black text-white flex items-center justify-center">
            <Plus size={18} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {HABIT_DURATION_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setDurationWeeks(opt.weeks)}
              className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-full ${
                durationWeeks === opt.weeks ? "bg-black text-white" : "bg-black/8 text-black/50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {presets.filter((p) => !existingLabels.has(p.toLowerCase())).map((preset) => (
          <button key={preset} onClick={() => addHabit(client.id, preset)} className="text-xs bg-black/8 text-black/60 px-3 py-1.5 rounded-full">
            + {preset}
          </button>
        ))}
      </div>
    </div>
  );
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ScheduleFormSheet({ open, onClose, client, showToast }) {
  const { db, scheduleForm } = useApp();
  const forms = db.forms || [];
  const [formId, setFormId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(1);

  React.useEffect(() => {
    if (open) {
      setFormId(forms[0]?.id || "");
      setDayOfWeek(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function submit(e) {
    e.preventDefault();
    if (!formId) return;
    scheduleForm(client.id, formId, dayOfWeek);
    showToast("Check-in scheduled");
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Schedule a Check-in">
      {forms.length === 0 ? (
        <p className="text-black/30 text-sm text-center py-6">No check-in forms yet — build one in Library → Forms first.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <p className="text-black/40 text-xs tracking-wide mb-1.5">FORM</p>
            <Select value={formId} onChange={(e) => setFormId(e.target.value)}>
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <p className="text-black/40 text-xs tracking-wide mb-1.5">REPEATS WEEKLY ON</p>
            <div className="grid grid-cols-7 gap-1.5">
              {DAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setDayOfWeek(i)}
                  className={`py-2.5 rounded-lg text-xs font-semibold ${dayOfWeek === i ? "bg-blue-500 text-white" : "bg-black/8 text-black/50"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <PrimaryButton type="submit" className="w-full">
            <Calendar size={16} /> SCHEDULE CHECK-IN
          </PrimaryButton>
        </form>
      )}
    </BottomSheet>
  );
}

function CheckInsPanel({ client, showToast }) {
  const { db, unscheduleForm, toggleFormSchedule, markFormResponseRead } = useApp();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [viewingResponse, setViewingResponse] = useState(null);
  const forms = db.forms || [];
  const schedules = (db.formSchedules || {})[client.id] || [];
  const responses = (db.formResponses || {})[client.id] || [];
  const formsById = Object.fromEntries(forms.map((f) => [f.id, f]));

  return (
    <div className="max-w-2xl px-4 py-5 md:px-6 md:py-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-black font-semibold">Scheduled Check-ins</p>
        <button onClick={() => setScheduleOpen(true)} className="flex items-center gap-1.5 bg-black text-white text-xs font-bold px-3 py-2 rounded-lg">
          <Plus size={13} /> Schedule
        </button>
      </div>

      {schedules.length === 0 ? (
        <div className="border border-dashed border-black/12 rounded-2xl py-8 text-center mb-6">
          <p className="text-black/30 text-sm">No check-ins scheduled yet.</p>
        </div>
      ) : (
        <div className="space-y-2 mb-6">
          {schedules.map((s) => {
            const form = formsById[s.formId];
            return (
              <div key={s.id} className="flex items-center gap-3 bg-black/[0.03] border border-black/8 rounded-xl px-4 py-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                  <NotebookPen size={15} className="text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-black font-medium text-sm truncate">{form?.name || "Deleted form"}</p>
                  <p className="text-black/35 text-xs">Every {DAY_LABELS[s.dayOfWeek]}</p>
                </div>
                <button
                  onClick={() => toggleFormSchedule(client.id, s.id)}
                  className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${s.active ? "bg-blue-500" : "bg-black/15"}`}
                  aria-label={s.active ? "Pause schedule" : "Resume schedule"}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${s.active ? "left-[18px]" : "left-0.5"}`} />
                </button>
                <button
                  onClick={() => unscheduleForm(client.id, s.id)}
                  className="w-7 h-7 shrink-0 flex items-center justify-center text-black/30 hover:text-black/60"
                  aria-label="Remove schedule"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-black font-semibold mb-3">Responses</p>
      {responses.length === 0 ? (
        <p className="text-black/30 text-sm">No check-ins submitted yet.</p>
      ) : (
        <div className="space-y-2">
          {responses.map((r) => {
            const form = formsById[r.formId];
            return (
              <button
                key={r.id}
                onClick={() => {
                  setViewingResponse(r);
                  if (r.read === false) markFormResponseRead(r.id);
                }}
                className="w-full flex items-center gap-3 bg-black/[0.03] border border-black/8 rounded-xl px-4 py-3 text-left hover:bg-black/[0.06] transition-colors"
              >
                {r.read === false && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-black font-medium text-sm truncate">{form?.name || "Deleted form"}</p>
                  <p className="text-black/35 text-xs">{new Date(r.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</p>
                </div>
                <ChevronRight size={16} className="text-black/25 shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      <ScheduleFormSheet open={scheduleOpen} onClose={() => setScheduleOpen(false)} client={client} showToast={showToast} />

      <BottomSheet open={!!viewingResponse} onClose={() => setViewingResponse(null)} title={formsById[viewingResponse?.formId]?.name || "Check-in"}>
        {viewingResponse && (
          <div className="space-y-3">
            {(formsById[viewingResponse.formId]?.questions || []).map((q) => (
              <div key={q.id} className="bg-black/5 rounded-xl px-3.5 py-2.5">
                <p className="text-black/40 text-[11px] tracking-wide mb-1">{q.label || "Untitled question"}</p>
                {q.type === "photo" && viewingResponse.answers[q.id] ? (
                  <img src={viewingResponse.answers[q.id]} alt="" className="w-full rounded-lg mt-1 max-h-48 object-cover" />
                ) : (
                  <p className="text-black text-sm">
                    {q.type === "rating" && viewingResponse.answers[q.id] ? `${viewingResponse.answers[q.id]} / 5` : viewingResponse.answers[q.id] || "—"}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

const ACTIVITY_LEVELS = [
  { key: "sedentary", label: "Sedentary — little/no exercise", mult: 1.2 },
  { key: "light", label: "Light — exercise 1–3 days/week", mult: 1.375 },
  { key: "moderate", label: "Moderate — exercise 3–5 days/week", mult: 1.55 },
  { key: "active", label: "Active — exercise 6–7 days/week", mult: 1.725 },
  { key: "veryActive", label: "Very active — hard training + physical job", mult: 1.9 },
];

// A goal shifts the suggested calorie target off TDEE and shifts the
// suggested macro split with it — a cut leans on more protein to protect
// muscle and satiety in a deficit, a bulk leans on more carbs to fuel the
// extra training volume a surplus is meant to support.
const NUTRITION_GOALS = [
  { key: "cut", label: "Cut", delta: -500, macros: { protein: 40, carbs: 30, fat: 30 } },
  { key: "maintain", label: "Maintain", delta: 0, macros: { protein: 30, carbs: 40, fat: 30 } },
  { key: "bulk", label: "Bulk", delta: 350, macros: { protein: 30, carbs: 45, fat: 25 } },
];

// Mifflin-St Jeor — the standard, well-validated BMR formula. Needs
// age/sex/height (set on the client's Summary tab) and a current weight
// (their latest weigh-in), so it's disabled with a nudge until those exist
// rather than guessing.
function TDEECalculator({ client, latestWeight, onApply }) {
  const [weight, setWeight] = useState(latestWeight || "");
  const [activity, setActivity] = useState("moderate");
  const [goalKey, setGoalKey] = useState("maintain");

  const ready = client.age && client.sex && client.heightCm;
  const w = Number(weight) || 0;
  const level = ACTIVITY_LEVELS.find((l) => l.key === activity);
  const goal = NUTRITION_GOALS.find((g) => g.key === goalKey);
  const bmr = ready && w > 0 ? 10 * w + 6.25 * client.heightCm - 5 * client.age + (client.sex === "Male" ? 5 : -161) : 0;
  const tdee = Math.round((bmr * level.mult) / 25) * 25;
  const suggestedCalories = Math.max(1200, Math.round((tdee + goal.delta) / 25) * 25);

  return (
    <div>
      <p className="text-black text-sm font-semibold mb-3">TDEE Calculator</p>
      {!ready ? (
        <p className="text-black/40 text-xs">Add age, sex and height on the Summary tab to enable this.</p>
      ) : (
        <div className="space-y-3.5">
          <div className="grid grid-cols-3 gap-2 text-center bg-black/[0.03] rounded-xl py-2.5">
            <div>
              <p className="text-black/30 text-[10px]">AGE</p>
              <p className="text-black text-sm font-semibold">{client.age}</p>
            </div>
            <div>
              <p className="text-black/30 text-[10px]">SEX</p>
              <p className="text-black text-sm font-semibold">{client.sex}</p>
            </div>
            <div>
              <p className="text-black/30 text-[10px]">HEIGHT</p>
              <p className="text-black text-sm font-semibold">{client.heightCm}cm</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-black/40 text-[10px] mb-1">CURRENT WEIGHT (KG)</p>
              <input
                type="number"
                min={0}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder={latestWeight ? String(latestWeight) : "No weigh-ins yet"}
                className="w-full bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-black text-sm outline-none"
              />
            </div>
            <div>
              <p className="text-black/40 text-[10px] mb-1">ACTIVITY LEVEL</p>
              <select
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                className="w-full bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-black text-xs outline-none"
              >
                {ACTIVITY_LEVELS.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <p className="text-black/40 text-[10px] mb-1">GOAL</p>
            <div className="grid grid-cols-3 gap-1.5">
              {NUTRITION_GOALS.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setGoalKey(g.key)}
                  className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    goalKey === g.key ? "bg-black text-white" : "bg-white border border-black/10 text-black/50"
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          {w > 0 && (
            <div className="bg-black/[0.03] rounded-xl px-3.5 py-3">
              <p className="text-black/40 text-[10px]">BMR {Math.round(bmr)} kcal · TDEE {tdee} kcal</p>
              <div className="flex items-center justify-between mt-1.5 flex-wrap gap-2">
                <div>
                  <p className="text-black text-lg font-bold leading-none">{suggestedCalories} kcal</p>
                  <p className="text-black/40 text-[11px] mt-1">
                    P {goal.macros.protein}% · C {goal.macros.carbs}% · F {goal.macros.fat}%
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onApply({
                      calories: suggestedCalories,
                      proteinPct: goal.macros.protein,
                      carbsPct: goal.macros.carbs,
                      fatPct: goal.macros.fat,
                    })
                  }
                  className="bg-black text-white text-xs font-bold px-3 py-2 rounded-lg shrink-0"
                >
                  USE THIS
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NutritionTargetsCard({ client, showToast }) {
  const { db, updateUser } = useApp();
  const saved = { ...DEFAULT_NUTRITION_TARGETS, ...(client.nutritionTargets || {}) };
  const [calories, setCalories] = useState(saved.calories);
  const [pcts, setPcts] = useState({ protein: saved.proteinPct, carbs: saved.carbsPct, fat: saved.fatPct });
  const [saving, setSaving] = useState(false);
  const loadedRef = useRef(client.id);
  const weighIns = (db.weighIns || {})[client.id] || [];
  const latestWeight = weighIns.length ? [...weighIns].sort((a, b) => b.date - a.date)[0].weight : null;

  // Re-seed the draft if the coach switches to a different client.
  if (loadedRef.current !== client.id) {
    loadedRef.current = client.id;
    setCalories(saved.calories);
    setPcts({ protein: saved.proteinPct, carbs: saved.carbsPct, fat: saved.fatPct });
  }

  const dirty = calories !== saved.calories || pcts.protein !== saved.proteinPct || pcts.carbs !== saved.carbsPct || pcts.fat !== saved.fatPct;
  const grams = {
    protein: macroGrams(calories, pcts.protein, 4),
    carbs: macroGrams(calories, pcts.carbs, 4),
    fat: macroGrams(calories, pcts.fat, 9),
  };

  function setPct(key, value) {
    setPcts((prev) => adjustMacroPct(prev, key, value));
  }

  async function save() {
    setSaving(true);
    try {
      await updateUser(client.id, {
        nutritionTargets: { calories, proteinPct: pcts.protein, carbsPct: pcts.carbs, fatPct: pcts.fat },
      });
      showToast("Nutrition targets saved");
    } catch (err) {
      showToast(err.message || "Couldn't save targets");
    } finally {
      setSaving(false);
    }
  }

  const MACROS = [
    { key: "protein", label: "Protein", color: "#3B82F6" },
    { key: "carbs", label: "Carbs", color: "#10B981" },
    { key: "fat", label: "Fat", color: "#F59E0B" },
  ];

  return (
    <div className="bg-white border border-black/10 rounded-2xl shadow-sm p-5 md:p-6">
      <p className="text-black font-semibold mb-1">Nutrition Targets</p>
      <p className="text-black/40 text-xs mb-5">What this client sees as their daily calorie and macro goals in the app.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <TDEECalculator
          client={client}
          latestWeight={latestWeight}
          onApply={({ calories: kcal, proteinPct, carbsPct, fatPct }) => {
            setCalories(Math.min(4500, Math.max(1200, kcal)));
            setPcts({ protein: proteinPct, carbs: carbsPct, fat: fatPct });
          }}
        />

        <div className="lg:border-l lg:border-black/10 lg:pl-8">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-black/50 text-xs tracking-wide">CALORIES</span>
            <span className="text-black font-bold text-sm">{calories} kcal</span>
          </div>
          <input
            type="range"
            min={1200}
            max={4500}
            step={25}
            value={calories}
            onChange={(e) => setCalories(Number(e.target.value))}
            className="w-full accent-black"
          />

          <div className="mt-4 space-y-3.5">
            {MACROS.map((m) => (
              <div key={m.key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-black/50 text-xs tracking-wide">{m.label.toUpperCase()}</span>
                  <span className="text-black text-sm font-semibold">
                    {pcts[m.key]}% · {grams[m.key]}g
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={pcts[m.key]}
                  onChange={(e) => setPct(m.key, Number(e.target.value))}
                  className="w-full"
                  style={{ accentColor: m.color }}
                />
              </div>
            ))}
          </div>

          <p className="text-black/25 text-[11px] mt-3">Protein + Carbs + Fat always add up to 100% of calories — adjusting one rebalances the others.</p>

          <button
            onClick={save}
            disabled={!dirty || saving}
            className={`w-full mt-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${
              !dirty && !saving ? "bg-black/8 text-black/30" : "bg-black text-white"
            }`}
          >
            {saving ? "SAVING…" : dirty ? "SAVE TARGETS" : "SAVED"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Context a coach would gather on an intake call and lean on when
// building meal plans — kept in the Nutrition tab (not Profile/Summary)
// since it's nutrition-specific, unlike the general preferences a client
// sets for themselves.
function ClientFoodPreferencesCard({ client, showToast }) {
  const { updateUser } = useApp();
  const info = client.nutritionProfile || {};
  const [likes, setLikes] = useState(info.likes || "");
  const [dislikes, setDislikes] = useState(info.dislikes || "");
  const [mealsPerDay, setMealsPerDay] = useState(info.mealsPerDay || "");
  const [occupation, setOccupation] = useState(info.occupation || "");
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    setLikes(info.likes || "");
    setDislikes(info.dislikes || "");
    setMealsPerDay(info.mealsPerDay || "");
    setOccupation(info.occupation || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  async function save() {
    setSaving(true);
    try {
      await updateUser(client.id, { nutritionProfile: { likes, dislikes, mealsPerDay, occupation } });
      showToast("Nutrition info saved");
    } catch (err) {
      showToast(err.message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-black/10 rounded-2xl shadow-sm p-5 md:p-6">
      <p className="text-black font-semibold mb-1">Client Nutrition Info</p>
      <p className="text-black/40 text-xs mb-5">Context for planning meals — occupation, eating pattern, likes/dislikes.</p>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
        <div className="sm:col-span-1">
          <p className="text-black/40 text-[10px] mb-1">OCCUPATION</p>
          <input
            value={occupation}
            onChange={(e) => setOccupation(e.target.value)}
            placeholder="e.g. Office worker, tradie"
            className="w-full bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-black text-sm outline-none placeholder:text-black/25"
          />
        </div>
        <div className="sm:col-span-1">
          <p className="text-black/40 text-[10px] mb-1">PREFERRED MEALS/DAY</p>
          <input
            type="number"
            min={1}
            max={10}
            value={mealsPerDay}
            onChange={(e) => setMealsPerDay(e.target.value)}
            placeholder="e.g. 3"
            className="w-full bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-black text-sm outline-none placeholder:text-black/25"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div>
          <p className="text-black/40 text-[10px] mb-1">FOODS THEY ENJOY</p>
          <textarea
            rows={3}
            value={likes}
            onChange={(e) => setLikes(e.target.value)}
            placeholder="e.g. Chicken, rice, most fruit, spicy food"
            className="w-full bg-white border border-black/10 rounded-lg px-2.5 py-2 text-black text-xs outline-none placeholder:text-black/25 resize-none"
          />
        </div>
        <div>
          <p className="text-black/40 text-[10px] mb-1">FOODS THEY DISLIKE / AVOID</p>
          <textarea
            rows={3}
            value={dislikes}
            onChange={(e) => setDislikes(e.target.value)}
            placeholder="e.g. Mushrooms, seafood, doesn't like eating breakfast"
            className="w-full bg-white border border-black/10 rounded-lg px-2.5 py-2 text-black text-xs outline-none placeholder:text-black/25 resize-none"
          />
        </div>
      </div>
      <button onClick={save} disabled={saving} className="w-full sm:w-auto sm:px-8 bg-black text-white text-xs font-bold py-2.5 rounded-xl disabled:opacity-50">
        {saving ? "SAVING…" : "SAVE NUTRITION INFO"}
      </button>
    </div>
  );
}

function NutritionPanel({ client, showToast }) {
  const { db, setNutritionForDate } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  const todayDateKey = new Date().toISOString().slice(0, 10);
  const nutrition = (db.nutritionLogs[client.id] || []).find((n) => n.date === todayDateKey);

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 pb-16">
      <div className="space-y-6 mb-6">
        <NutritionTargetsCard client={client} showToast={showToast} />
        <ClientFoodPreferencesCard client={client} showToast={showToast} />
      </div>

      <div className="bg-white border border-black/10 rounded-2xl shadow-sm p-5">
        <p className="text-black font-semibold mb-4">Today's Nutrition Log</p>
        {!nutrition ? (
          <p className="text-black/30 text-sm">Nothing logged yet.</p>
        ) : (
          <div className="bg-black/[0.03] border border-black/8 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              ["Cals", nutrition.calories],
              ["Protein", `${nutrition.protein}g`],
              ["Carbs", `${nutrition.carbs}g`],
              ["Fat", `${nutrition.fat}g`],
            ].map(([l, v]) => (
              <div key={l} className="text-center">
                <p className="text-black font-bold">{v}</p>
                <p className="text-black/40 text-[11px] mt-0.5">{l}</p>
              </div>
            ))}
          </div>
        )}
        {!confirmReset ? (
          <button
            onClick={() => setConfirmReset(true)}
            className="flex items-center gap-2 bg-black/5 border border-black/10 text-black/60 text-sm font-medium px-4 py-2.5 rounded-xl"
          >
            <Trash2 size={13} /> Clear today's log
          </button>
        ) : (
          <div className="flex gap-2 max-w-xs">
            <SecondaryButton className="flex-1" onClick={() => setConfirmReset(false)}>
              Cancel
            </SecondaryButton>
            <DangerButton
              className="flex-1"
              onClick={() => {
                setNutritionForDate(client.id, todayDateKey, () => ({
                  calories: 0,
                  protein: 0,
                  carbs: 0,
                  fat: 0,
                  water: 0,
                  meals: { Breakfast: [], Lunch: [], Dinner: [], Snacks: [], "Pre-workout": [], "Post-workout": [] },
                }));
                setConfirmReset(false);
                showToast("Today's nutrition log cleared");
              }}
            >
              Confirm clear
            </DangerButton>
          </div>
        )}
      </div>
    </div>
  );
}

export function WorkoutLogCard({ log, exercisesById, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const hasFlags = log.entries.some((e) => e.note || e.swapReason);
  const prCount = log.entries.reduce((a, e) => a + e.sets.filter((s) => s.isPR).length, 0);
  const volume = log.entries.reduce((a, e) => a + e.sets.reduce((b, s) => b + (s.weight || 0) * (s.reps || 0), 0), 0);

  if (log.cardio) {
    const details = [
      log.cardio.durationMin ? `${log.cardio.durationMin} min` : null,
      log.cardio.distanceKm ? `${log.cardio.distanceKm} km` : null,
      log.cardio.caloriesBurned ? `${log.cardio.caloriesBurned} kcal` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <div className="bg-black/[0.03] border border-black/8 rounded-xl px-3.5 py-3">
        <p className="text-black text-sm font-semibold">{log.cardio.activityLabel || log.dayLabel}</p>
        <p className="text-black/40 text-xs mt-0.5">
          {new Date(log.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
          {details && <span> · {details}</span>}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-black/[0.03] border border-black/8 rounded-xl overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-3.5 py-3 text-left">
        <div>
          <p className="text-black text-sm font-semibold">{log.dayLabel}</p>
          <p className="text-black/40 text-xs mt-0.5">
            {new Date(log.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            {" · "}
            {volume.toLocaleString()} kg lifted
            {prCount > 0 && <span className="text-amber-600 font-semibold"> · {prCount} PR{prCount === 1 ? "" : "s"}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasFlags && <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
          <ChevronDown size={16} className={`text-black/30 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 space-y-2.5">
          {log.entries.map((e, i) => {
            const exercise = exercisesById[e.exerciseId];
            return (
              <div key={i} className="bg-white border border-black/5 rounded-lg px-3 py-2.5">
                <p className="text-black text-sm font-semibold">{exercise?.name || "Exercise"}</p>
                <p className="text-black/40 text-xs mt-0.5 flex flex-wrap gap-x-1.5 gap-y-0.5">
                  {e.sets.map((s, si) => (
                    <span key={si} className={s.isPR ? "text-amber-600 font-semibold" : ""}>
                      {s.reps}×{s.weight}kg{s.isPR ? " (PR)" : ""}
                    </span>
                  ))}
                </p>
                {e.swapReason && (
                  <div className="mt-2 flex items-start gap-1.5 bg-blue-50 rounded-lg px-2.5 py-2">
                    <Repeat size={12} className="text-blue-600 shrink-0 mt-0.5" />
                    <p className="text-blue-700 text-xs leading-snug">
                      <span className="font-semibold">Swapped from {e.swappedFromName || "planned exercise"}.</span> {e.swapReason}
                    </p>
                  </div>
                )}
                {e.note && (
                  <div className="mt-2 flex items-start gap-1.5 bg-black/[0.04] rounded-lg px-2.5 py-2">
                    <NotebookPen size={12} className="text-black/40 shrink-0 mt-0.5" />
                    <p className="text-black/60 text-xs leading-snug">{e.note}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProgressPanel({ client }) {
  const { db } = useApp();
  const photos = db.progressPhotos[client.id] || [];
  const logs = db.workoutLogs[client.id] || [];
  const weighIns = (db.weighIns || {})[client.id] || [];
  const exercisesById = Object.fromEntries(db.exercises.map((e) => [e.id, e]));

  return (
    <div className="max-w-3xl px-4 py-5 md:px-6 md:py-6 space-y-6">
      <div>
        <p className="text-black font-semibold mb-4">Progress Photos</p>
        {photos.length === 0 ? (
          <p className="text-black/30 text-sm">No photos uploaded by this client yet.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {photos.map((p) => {
              const w = closestWeighIn(weighIns, p.date);
              return (
                <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden bg-black/5">
                  <img src={p.url} alt="Progress" className="w-full h-full object-cover" />
                  <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[10px] font-medium px-1.5 py-1 text-center">
                    {new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    {w ? ` · ${w.weight}kg` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <p className="text-black font-semibold mb-2">Training Log</p>
        <p className="text-black/40 text-xs mb-4">
          Recent completed sessions — includes any exercise the client swapped mid-session and their note explaining why.
        </p>
        {logs.length === 0 ? (
          <p className="text-black/30 text-sm">No completed workouts yet.</p>
        ) : (
          <div className="space-y-2">
            {logs.slice(0, 12).map((log) => (
              <WorkoutLogCard key={log.id} log={log} exercisesById={exercisesById} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function fmtStatDate(ts) {
  if (!ts) return "Never";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const SEX_OPTIONS = ["Male", "Female", "Other"];

// A label above a bottom-border-only field — no boxed input, just a clean
// underline that brightens on focus-within, for a lighter "form" feel
// than another nested bordered box.
function UnderlineField({ label, children }) {
  return (
    <label className="block">
      <p className="text-black/35 text-[10px] font-semibold tracking-wide mb-1">{label.toUpperCase()}</p>
      <div className="border-b border-black/10 focus-within:border-black/40 pb-1.5 transition-colors">{children}</div>
    </label>
  );
}

// The stuff a coach would normally ask about on an intake call — kept
// separate from TAGS/NOTES (which are freeform) so age/height/sex are
// structured enough for the TDEE calculator in the Nutrition tab to read
// directly off the client doc.
// Same 30-day snapshot the client sees on their own Progress tab —
// strength trend, bodyweight change, consistency, PRs — surfaced here so
// the coach doesn't have to go dig for it separately.
function PerformanceTimelineCard({ client }) {
  const { db } = useApp();
  const logs = db.workoutLogs[client.id] || [];
  const weighIns = (db.weighIns || {})[client.id] || [];
  const scheduledWorkouts = (db.scheduledWorkouts || {})[client.id] || [];
  const exercisesById = useMemo(() => Object.fromEntries((db.exercises || []).map((e) => [e.id, e])), [db.exercises]);
  const timeline = useMemo(() => computePerformanceTimeline(logs, weighIns, exercisesById, 30), [logs, weighIns, exercisesById]);
  const weekly = useMemo(() => computeWeeklySessionCompletion(logs, scheduledWorkouts), [logs, scheduledWorkouts]);

  const items = [
    {
      label: "Strength",
      sub: "avg. gain on main lifts",
      value: timeline.strengthChangePct != null ? `${timeline.strengthChangePct > 0 ? "+" : ""}${timeline.strengthChangePct}%` : "—",
    },
    {
      label: "Bodyweight",
      sub: "change over 30 days",
      value: timeline.bodyweightChange != null ? `${timeline.bodyweightChange > 0 ? "+" : ""}${timeline.bodyweightChange} kg` : "—",
    },
    {
      label: "Consistency",
      sub: weekly.pct != null ? `${weekly.completed} of ${weekly.expected} sessions` : "nothing scheduled this week",
      value: weekly.pct != null ? `${weekly.pct}%` : "—",
    },
    { label: "PRs set", sub: "new heaviest lifts", value: `${timeline.prCount}` },
  ];

  return (
    <div className="bg-black rounded-2xl p-5 mb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-white/40 text-[11px] font-semibold tracking-wide uppercase">Last 30 Days</p>
          <p className="text-white font-bold text-lg mt-0.5">Performance Timeline</p>
        </div>
        <p className="text-white text-xs text-right shrink-0 mt-0.5">
          {client.lastLoginAt
            ? new Date(client.lastLoginAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            : "Never logged in"}
          <span className="block text-white/40 text-[10px] font-medium mt-0.5">Last active</span>
        </p>
      </div>
      <p className="text-white/35 text-xs mt-1 mb-4">
        A quick read on how {client.name?.split(" ")[0] || "they"}'ve been trending: getting stronger, showing up, hitting new bests.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
        {items.map((it) => (
          <div key={it.label}>
            <p className="text-white text-xl font-bold tabular-nums">{it.value}</p>
            <p className="text-white/40 text-[11px] mt-0.5">
              {it.label} <span className="text-white/25">· {it.sub}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// A weekly digest so the coach doesn't have to piece together training,
// nutrition and habit consistency by hand — plus a coach-editable "focus
// for next week" note, pre-filled with a suggestion pointed at whichever
// area looks weakest this week.
function WeeklyCoachReviewCard({ client, showToast }) {
  const { db, updateUser } = useApp();
  const logs = db.workoutLogs[client.id] || [];
  const nutritionLogs = (db.nutritionLogs || {})[client.id] || [];
  const habits = (db.habits || {})[client.id] || [];
  const habitLog = ((db.habitLog || {})[client.id]) || {};
  const weekAgo = Date.now() - 7 * 86400000;

  const sessionsThisWeek = logs.filter((l) => l.date >= weekAgo).length;
  const volumeThisWeek = Math.round(
    logs
      .filter((l) => l.date >= weekAgo)
      .reduce((a, log) => a + log.entries.reduce((b, e) => b + e.sets.reduce((c, s) => c + (s.weight || 0) * (s.reps || 0), 0), 0), 0)
  );
  const prCount = computePRsInLastNDays(logs, 7);

  const last7Dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().slice(0, 10);
  });
  const nutritionByDate = Object.fromEntries(nutritionLogs.map((n) => [n.date, n]));
  const daysLogged = last7Dates.filter((d) => nutritionByDate[d]?.calories > 0).length;
  const nutritionAdherencePct = Math.round((daysLogged / 7) * 100);

  let habitPossible = 0;
  let habitDone = 0;
  last7Dates.forEach((d) => {
    const completed = habitLog[d] || [];
    habits.forEach((h) => {
      if (h.endsAt && h.endsAt < weekAgo) return;
      const createdKey = new Date(h.createdAt).toISOString().slice(0, 10);
      if (d < createdKey) return;
      habitPossible += 1;
      if (completed.includes(h.id)) habitDone += 1;
    });
  });
  const consistencyPct = habitPossible > 0 ? Math.round((habitDone / habitPossible) * 100) : null;

  const autoFocus = useMemo(() => {
    if (sessionsThisWeek === 0) return "No sessions logged this week — check they're not stuck, injured, or need the program adjusted.";
    if (nutritionAdherencePct < 60) return "Nutrition logging dropped off this week — check in on what's getting in the way.";
    if (consistencyPct != null && consistencyPct < 60) return "Habit consistency slipped — worth a quick nudge or simplifying the list.";
    return "Solid week across the board — keep the current program and progress load as planned.";
  }, [sessionsThisWeek, nutritionAdherencePct, consistencyPct]);

  const [focus, setFocus] = useState(client.weeklyFocusNote || "");
  const [saving, setSaving] = useState(false);
  const loadedRef = useRef(client.id);
  if (loadedRef.current !== client.id) {
    loadedRef.current = client.id;
    setFocus(client.weeklyFocusNote || "");
  }

  async function saveFocus() {
    setSaving(true);
    try {
      await updateUser(client.id, { weeklyFocusNote: focus });
      showToast("Focus saved");
    } catch (err) {
      showToast("Couldn't save — check your connection and try again");
    } finally {
      setSaving(false);
    }
  }

  const stats = [
    { label: "Sessions", sub: "this week", value: sessionsThisWeek },
    { label: "Volume", sub: "kg lifted", value: volumeThisWeek.toLocaleString() },
    { label: "Nutrition", sub: "days logged", value: `${nutritionAdherencePct}%` },
    { label: "Habits", sub: "completion", value: consistencyPct != null ? `${consistencyPct}%` : "—" },
    { label: "PRs", sub: "this week", value: prCount },
  ];

  return (
    <div className="bg-white border border-black/10 rounded-2xl shadow-sm p-5 md:p-6 mb-6">
      <p className="text-black font-semibold mb-1">Weekly Coach Review</p>
      <p className="text-black/40 text-xs mb-4">Training, nutrition, recovery and performance — last 7 days.</p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-5">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-black text-lg font-bold tabular-nums">{s.value}</p>
            <p className="text-black/40 text-[11px] mt-0.5">
              {s.label} <span className="text-black/25">· {s.sub}</span>
            </p>
          </div>
        ))}
      </div>

      <div className="border-t border-black/10 pt-4">
        <p className="text-black/40 text-[10px] font-semibold tracking-wide mb-1.5">FOCUS FOR NEXT WEEK</p>
        <textarea
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder={autoFocus}
          rows={2}
          className="w-full bg-black/[0.03] border border-black/10 rounded-xl px-3 py-2 text-sm text-black outline-none placeholder:text-black/30 resize-none"
        />
        <button
          onClick={saveFocus}
          disabled={saving || focus === (client.weeklyFocusNote || "")}
          className="mt-2 bg-black text-white text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-30"
        >
          {saving ? "SAVING…" : "SAVE FOCUS"}
        </button>
      </div>
    </div>
  );
}

function PersonalDetailsCard({ client, showToast }) {
  const { updateUser } = useApp();
  const [age, setAge] = useState(client.age || "");
  const [sex, setSex] = useState(client.sex || "");
  const [heightCm, setHeightCm] = useState(client.heightCm || "");
  const [trainingHistory, setTrainingHistory] = useState(client.trainingHistory || "");
  const [injuries, setInjuries] = useState(client.injuries || "");
  const [otherInfo, setOtherInfo] = useState(client.otherInfo || "");
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    setAge(client.age || "");
    setSex(client.sex || "");
    setHeightCm(client.heightCm || "");
    setTrainingHistory(client.trainingHistory || "");
    setInjuries(client.injuries || "");
    setOtherInfo(client.otherInfo || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  async function save() {
    setSaving(true);
    try {
      await updateUser(client.id, {
        age: age === "" ? null : Number(age),
        sex,
        heightCm: heightCm === "" ? null : Number(heightCm),
        trainingHistory,
        injuries,
        otherInfo,
      });
      showToast("Personal details saved");
    } catch (err) {
      showToast(err.message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-black/10 rounded-2xl shadow-sm mb-5 overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-black/8">
        <div>
          <p className="text-black font-bold text-[15px]">Personal Details</p>
          <p className="text-black/35 text-xs mt-0.5">The essentials for planning their training and nutrition</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="bg-black text-white text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50 shrink-0"
        >
          {saving ? "SAVING…" : "SAVE"}
        </button>
      </div>

      <div className="px-5 py-4">
        <div className="grid grid-cols-3 gap-5 mb-4">
          <UnderlineField label="Age">
            <input type="number" min={0} value={age} onChange={(e) => setAge(e.target.value)} className="w-full bg-transparent outline-none text-black text-sm" />
          </UnderlineField>
          <UnderlineField label="Sex">
            <select
              value={sex}
              onChange={(e) => setSex(e.target.value)}
              className="w-full bg-transparent outline-none text-black text-sm appearance-none"
            >
              <option value=""></option>
              {SEX_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </UnderlineField>
          <UnderlineField label="Height (cm)">
            <input
              type="number"
              min={0}
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              className="w-full bg-transparent outline-none text-black text-sm"
            />
          </UnderlineField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <UnderlineField label="Training history">
            <textarea
              rows={2}
              value={trainingHistory}
              onChange={(e) => setTrainingHistory(e.target.value)}
              placeholder="e.g. 2 years lifting on and off, new to structured programming"
              className="w-full bg-transparent outline-none text-black text-sm placeholder:text-black/25 resize-none"
            />
          </UnderlineField>
          <UnderlineField label="Injuries / limitations">
            <textarea
              rows={2}
              value={injuries}
              onChange={(e) => setInjuries(e.target.value)}
              placeholder="e.g. Bad left knee, avoid deep squats"
              className="w-full bg-transparent outline-none text-black text-sm placeholder:text-black/25 resize-none"
            />
          </UnderlineField>
          <div className="md:col-span-2">
            <UnderlineField label="Other relevant info">
              <textarea
                rows={2}
                value={otherInfo}
                onChange={(e) => setOtherInfo(e.target.value)}
                placeholder="Anything else worth knowing about this client"
                className="w-full bg-transparent outline-none text-black text-sm placeholder:text-black/25 resize-none"
              />
            </UnderlineField>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryPanel({ client, showToast, onSendLogin }) {
  const { db, addClientTag, removeClientTag, addClientNote, deleteClientNote, sendMessage, sendPasswordReset } = useApp();
  const [tagInput, setTagInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [sendingReset, setSendingReset] = useState(false);

  async function sendLoginHelp() {
    setSendingReset(true);
    try {
      await sendPasswordReset(client.email);
      showToast(`Password reset email sent to ${client.email}`);
    } catch (err) {
      showToast(err.message);
    } finally {
      setSendingReset(false);
    }
  }

  const logs = db.workoutLogs[client.id] || [];
  const totalWorkouts = logs.length;
  const totalPRs = logs.reduce((a, log) => a + log.entries.reduce((b, e) => b + e.sets.filter((s) => s.isPR).length, 0), 0);
  const thread = db.messages[client.id] || [];
  const lastSent = [...thread].reverse().find((m) => m.from === "coach");
  const lastReceived = [...thread].reverse().find((m) => m.from === "client");
  const tags = (db.clientTags || {})[client.id] || [];
  const notes = (db.clientNotes || {})[client.id] || [];

  const phases = (db.clientPhases || {})[client.id] || [];
  const todayKey = new Date().toISOString().slice(0, 10);
  const phase = getCurrentPhase(phases, todayKey);
  const daysPerWeek = phase?.weeks?.[0]?.days?.length || 0;

  const now = Date.now();
  const thisWeekCount = logs.filter((l) => l.date >= now - 7 * 86400000).length;
  const prevWeekCount = logs.filter((l) => l.date >= now - 14 * 86400000 && l.date < now - 7 * 86400000).length;

  function sendWelcomeNow() {
    const welcome = db.welcomeMessage;
    if (!welcome?.text?.trim()) {
      showToast("Set up a welcome message in Settings first");
      return;
    }
    const text = welcome.text.replace(/\{name\}/gi, client.name.split(" ")[0]);
    const attachment = welcome.attachmentUrl ? { name: welcome.attachmentName || "Attachment.pdf", url: welcome.attachmentUrl } : undefined;
    sendMessage(client.id, "coach", text, attachment);
    showToast("Welcome message sent");
  }

  return (
    <div className="px-4 py-5 md:px-6 md:py-6">
      <PersonalDetailsCard client={client} showToast={showToast} />

      <PerformanceTimelineCard client={client} />

      <WeeklyCoachReviewCard client={client} showToast={showToast} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* left: stats, tags */}
        <div className="space-y-5">
          <div>
            <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-2">STATS</p>
            <div className="bg-black/[0.03] border border-black/8 rounded-xl divide-y divide-black/5">
              {[
                ["Total workouts", totalWorkouts],
                ["Personal bests", totalPRs],
                ["Last signed in", fmtStatDate(client.lastLoginAt)],
                ["Last message sent", fmtStatDate(lastSent?.date)],
                ["Last message received", fmtStatDate(lastReceived?.date)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between text-sm px-3.5 py-2.5">
                  <span className="text-black/50">{label}</span>
                  <span className="text-black font-semibold">{value}</span>
                </div>
              ))}
            </div>
            {client.status === "active" ? (
              <div className="flex flex-col gap-1.5 mt-2.5">
                <button onClick={sendWelcomeNow} className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 text-xs font-semibold">
                  <MailCheck size={13} /> Send welcome message now
                </button>
                <button
                  onClick={sendLoginHelp}
                  disabled={sendingReset}
                  className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 text-xs font-semibold disabled:opacity-40"
                >
                  <Send size={13} /> {sendingReset ? "Sending…" : "Resend login help"}
                </button>
              </div>
            ) : (
              <button onClick={onSendLogin} className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 text-xs font-semibold mt-2.5">
                <Send size={13} /> Send Login Details
              </button>
            )}
          </div>

          <div>
            <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-2">TAGS</p>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {tags.length === 0 && <span className="text-black/25 text-xs">No tags yet.</span>}
              {tags.map((t) => (
                <span key={t} className="flex items-center gap-1 bg-black/8 text-black/70 text-xs font-medium pl-2.5 pr-1.5 py-1 rounded-full">
                  {t}
                  <button onClick={() => removeClientTag(client.id, t)} className="text-black/30 hover:text-black/60" aria-label={`Remove ${t}`}>
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addClientTag(client.id, tagInput);
                setTagInput("");
              }}
              className="flex gap-1.5"
            >
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Add a tag, e.g. Low compliance"
                className="flex-1 bg-black/5 border border-black/10 rounded-lg px-2.5 py-1.5 text-xs text-black outline-none placeholder:text-black/25"
              />
              <button type="submit" className="bg-black text-white text-xs font-semibold px-3 rounded-lg shrink-0">
                Add
              </button>
            </form>
          </div>

        </div>

        {/* middle: program + session activity */}
        <div className="space-y-5">
          <div>
            <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-2">TRAINING PROGRAM</p>
            {phase ? (
              <div className="bg-black/[0.03] border border-black/8 rounded-xl p-4">
                <p className="text-black font-semibold text-sm">{phase.name}</p>
                <p className="text-black/40 text-xs mt-1">
                  {new Date(phase.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  {phase.endDate ? ` – ${new Date(phase.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : ""}
                </p>
                {phase.description && <p className="text-black/50 text-xs mt-2">{phase.description}</p>}
              </div>
            ) : (
              <p className="text-black/30 text-sm">No phase scheduled.</p>
            )}
          </div>

          <div>
            <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-2">
              SESSION ACTIVITY{daysPerWeek > 0 ? ` — program is ${daysPerWeek}/week` : ""}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-black/[0.03] border border-black/8 rounded-xl p-4 text-center">
                <p className="text-black text-2xl font-bold">{prevWeekCount}</p>
                <p className="text-black/40 text-xs mt-1">8–14 days ago</p>
              </div>
              <div className="bg-black/[0.03] border border-black/8 rounded-xl p-4 text-center">
                <p className="text-black text-2xl font-bold">{thisWeekCount}</p>
                <p className="text-black/40 text-xs mt-1">Last 7 days</p>
              </div>
            </div>
          </div>
        </div>

        {/* right: trainer notes */}
        <div>
          <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-2">TRAINER'S NOTES</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addClientNote(client.id, noteInput);
              setNoteInput("");
            }}
            className="mb-3"
          >
            <textarea
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Private note — only you can see this"
              rows={2}
              className="w-full bg-black/5 border border-black/10 rounded-xl px-3 py-2 text-sm text-black outline-none placeholder:text-black/25 resize-none mb-2"
            />
            <button type="submit" className="text-xs font-semibold bg-black text-white px-3 py-1.5 rounded-lg">
              Add note
            </button>
          </form>
          <div className="space-y-2">
            {notes.length === 0 && <p className="text-black/25 text-xs">No notes yet.</p>}
            {notes.map((n) => (
              <div key={n.id} className="bg-black/[0.03] rounded-lg px-3 py-2.5">
                <p className="text-black text-sm">{n.text}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-black/30 text-[10px]">
                    {new Date(n.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                  <button onClick={() => deleteClientNote(client.id, n.id)} className="text-black/25 hover:text-black/50" aria-label="Delete note">
                    <X size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const PROFILE_EQUIPMENT_OPTIONS = [
  "Barbell",
  "Dumbbells",
  "Kettlebells",
  "Resistance Bands",
  "Pull-up Bar",
  "Bench",
  "Cardio Machine",
  "Full Gym Access",
  "Bodyweight Only",
];
const PROFILE_DAY_OPTIONS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PROFILE_SESSION_LENGTH_OPTIONS = ["30 min", "45 min", "60 min", "75 min", "90+ min"];
const PROFILE_DIET_OPTIONS = ["No restrictions", "Vegetarian", "Vegan", "Halal", "Kosher", "Dairy-free", "Gluten-free", "Low-carb / Keto"];

function ProfileChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${active ? "bg-black text-white" : "bg-black/8 text-black/50 hover:bg-black/12"}`}
    >
      {children}
    </button>
  );
}

// Same fields the client can set for themselves (ClientApp.jsx's
// PreferencesSheet) — a coach can now set/override every one of them
// directly, e.g. after an in-person consult, instead of waiting for the
// client to fill them in from their side.
function ProfilePanel({ client, showToast }) {
  const { updateUser } = useApp();
  const prefs = client.preferences || {};
  const [goals, setGoals] = useState(prefs.goals || "");
  const [equipment, setEquipment] = useState(prefs.equipment || []);
  const [trainingDays, setTrainingDays] = useState(prefs.trainingDays || []);
  const [sessionLength, setSessionLength] = useState(prefs.sessionLength || "");
  const [trainingNotes, setTrainingNotes] = useState(prefs.trainingNotes || "");
  const [dietType, setDietType] = useState(prefs.dietType || "");
  const [nutritionNotes, setNutritionNotes] = useState(prefs.nutritionNotes || "");
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    setGoals(prefs.goals || "");
    setEquipment(prefs.equipment || []);
    setTrainingDays(prefs.trainingDays || []);
    setSessionLength(prefs.sessionLength || "");
    setTrainingNotes(prefs.trainingNotes || "");
    setDietType(prefs.dietType || "");
    setNutritionNotes(prefs.nutritionNotes || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  function toggle(list, setList, val) {
    setList(list.includes(val) ? list.filter((v) => v !== val) : [...list, val]);
  }

  async function save() {
    setSaving(true);
    try {
      await updateUser(client.id, {
        preferences: { ...prefs, goals, equipment, trainingDays, sessionLength, trainingNotes, dietType, nutritionNotes },
      });
      showToast("Profile updated");
    } catch (err) {
      showToast(err.message || "Couldn't save — please try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Avatar name={client.name} url={client.avatarUrl} size={56} />
        <div className="min-w-0">
          <p className="text-black font-bold text-lg truncate">{client.name}</p>
          <p className="text-black/40 text-sm truncate">{client.email}</p>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-2 flex items-center gap-1.5">
            <Target size={12} /> GOALS
          </p>
          <TextArea rows={3} value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="e.g. Build muscle, lose fat, improve strength on main lifts..." />
        </div>

        <div>
          <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-2 flex items-center gap-1.5">
            <Dumbbell size={12} /> EQUIPMENT ACCESS
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PROFILE_EQUIPMENT_OPTIONS.map((opt) => (
              <ProfileChip key={opt} active={equipment.includes(opt)} onClick={() => toggle(equipment, setEquipment, opt)}>
                {opt}
              </ProfileChip>
            ))}
          </div>
        </div>

        <div>
          <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-2">TRAINING PREFERENCES</p>
          <div className="bg-black/[0.03] border border-black/8 rounded-xl p-4 space-y-3">
            <div>
              <p className="text-black/40 text-xs mb-1.5">Preferred training days</p>
              <div className="flex flex-wrap gap-1.5">
                {PROFILE_DAY_OPTIONS.map((d) => (
                  <ProfileChip key={d} active={trainingDays.includes(d)} onClick={() => toggle(trainingDays, setTrainingDays, d)}>
                    {d}
                  </ProfileChip>
                ))}
              </div>
            </div>
            <div>
              <p className="text-black/40 text-xs mb-1.5">Preferred session length</p>
              <div className="flex flex-wrap gap-1.5">
                {PROFILE_SESSION_LENGTH_OPTIONS.map((s) => (
                  <ProfileChip key={s} active={sessionLength === s} onClick={() => setSessionLength(sessionLength === s ? "" : s)}>
                    {s}
                  </ProfileChip>
                ))}
              </div>
            </div>
            <TextArea
              rows={2}
              value={trainingNotes}
              onChange={(e) => setTrainingNotes(e.target.value)}
              placeholder="Injuries, limitations, preferred/avoided exercises..."
            />
          </div>
        </div>

        <div>
          <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-2">NUTRITION PREFERENCES</p>
          <div className="bg-black/[0.03] border border-black/8 rounded-xl p-4 space-y-3">
            <div>
              <p className="text-black/40 text-xs mb-1.5">Diet type</p>
              <div className="flex flex-wrap gap-1.5">
                {PROFILE_DIET_OPTIONS.map((d) => (
                  <ProfileChip key={d} active={dietType === d} onClick={() => setDietType(dietType === d ? "" : d)}>
                    {d}
                  </ProfileChip>
                ))}
              </div>
            </div>
            <TextArea rows={2} value={nutritionNotes} onChange={(e) => setNutritionNotes(e.target.value)} placeholder="Allergies, intolerances, other notes..." />
          </div>
        </div>

        <PrimaryButton onClick={save} disabled={saving} className="w-full">
          {saving ? "Saving…" : "Save Profile"}
        </PrimaryButton>
      </div>
    </div>
  );
}

// Labels/order mirror the client app's own bottom tabs (Home, Training,
// Nutrition, Check-ins, Progress, Profile) where a direct equivalent
// exists, so it's easy to reason about "this is what they see on X" —
// Summary, Calendar and Habits are coach-only admin views layered in
// alongside them.
const CLIENT_NAV = [
  { id: "summary", label: "Summary", icon: LayoutGrid },
  { id: "program", label: "Training", icon: Dumbbell },
  { id: "nutrition", label: "Nutrition", icon: Utensils },
  { id: "checkins", label: "Check-ins", icon: NotebookPen },
  { id: "progress", label: "Progress", icon: ImageIcon },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "habits", label: "Habits", icon: ListChecks },
  { id: "profile", label: "Profile", icon: User },
];

export default function CoachClientDetail({ clientId, onClose, showToast }) {
  const { db, removeClient, startViewAsClient, setClientAccessPaused } = useApp();
  const [clientTab, setClientTab] = useState("summary");
  const [messaging, setMessaging] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const client = db.users.find((u) => u.id === clientId);
  if (!client) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-white flex flex-col md:flex-row">
      {/* client mini-sidebar (desktop) */}
      <div className="hidden md:flex w-64 shrink-0 h-screen flex-col border-r border-black/8 bg-[#F7F7F8]">
        <div className="p-5 border-b border-black/8">
          <div className="flex items-center gap-3">
            <Avatar name={client.name} url={client.avatarUrl} size={48} />
            <div className="min-w-0">
              <p className="text-black font-bold text-sm truncate">{client.name}</p>
              <div className="flex items-center gap-1.5">
                <Pill tone={client.status === "active" ? "outline" : "muted"}>{client.status === "active" ? "Active" : "Not sent yet"}</Pill>
                {client.accessPaused && <Pill tone="warning">Paused</Pill>}
              </div>
            </div>
          </div>
          {client.status === "active" ? (
            <button
              onClick={() => setMessaging(true)}
              className="w-full mt-3 flex items-center justify-center gap-2 bg-black/8 hover:bg-black/15 text-black text-sm font-semibold py-2.5 rounded-xl transition-colors"
            >
              <MessageCircle size={15} /> Message
            </button>
          ) : (
            <button
              onClick={() => setSendOpen(true)}
              className="w-full mt-3 flex items-center justify-center gap-2 bg-black text-white text-sm font-bold py-2.5 rounded-xl"
            >
              <Send size={15} /> Send Login Details
            </button>
          )}
          {client.status === "active" && (
            <button
              onClick={() => startViewAsClient(client.id)}
              className="w-full mt-2 flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-semibold py-2.5 rounded-xl transition-colors"
              title="Browse and act in the app exactly as this client"
            >
              <Repeat size={15} /> View as Client
            </button>
          )}
          {client.status === "active" && (
            <button
              onClick={() => setClientAccessPaused(client.id, !client.accessPaused)}
              className={`w-full mt-2 flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-xl transition-colors ${
                client.accessPaused ? "bg-red-50 hover:bg-red-100 text-red-700" : "bg-black/5 hover:bg-black/10 text-black/60"
              }`}
              title="Restrict this client's access to their program/profile — e.g. for insufficient payment"
            >
              {client.accessPaused ? (
                <>
                  <Unlock size={15} /> Resume Access
                </>
              ) : (
                <>
                  <Lock size={15} /> Pause Access
                </>
              )}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {CLIENT_NAV.map((item) => {
            const Icon = item.icon;
            const active = clientTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setClientTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active ? "bg-black text-white" : "text-black/60 hover:bg-black/5 hover:text-black/90"
                }`}
              >
                <Icon size={16} strokeWidth={active ? 2.4 : 2} />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-black/8 space-y-1">
          {!confirmRemove ? (
            <button
              onClick={() => setConfirmRemove(true)}
              className="w-full text-left px-3.5 py-2 text-black/30 hover:text-black/60 text-xs font-medium"
            >
              Remove client
            </button>
          ) : (
            <div className="flex gap-1.5 px-1">
              <button onClick={() => setConfirmRemove(false)} className="flex-1 bg-black/8 text-black text-xs font-semibold py-2 rounded-lg">
                Cancel
              </button>
              <button
                onClick={() => {
                  removeClient(client.id);
                  showToast("Client removed");
                  onClose();
                }}
                className="flex-1 bg-red-500/20 text-red-300 text-xs font-semibold py-2 rounded-lg"
              >
                Confirm
              </button>
            </div>
          )}
          <button onClick={onClose} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-black/50 hover:text-black text-sm font-medium">
            <ArrowLeft size={15} /> Return to overview
          </button>
        </div>
      </div>

      {/* mobile header */}
      <div className="md:hidden shrink-0 bg-[#F7F7F8] border-b border-black/8">
        <div className="flex items-center gap-2.5 px-3 pt-4 pb-3">
          <button onClick={onClose} aria-label="Return to overview" className="w-8 h-8 -ml-1 flex items-center justify-center text-black/60 shrink-0">
            <ArrowLeft size={18} />
          </button>
          <Avatar name={client.name} url={client.avatarUrl} size={38} />
          <div className="min-w-0 flex-1">
            <p className="text-black font-bold text-sm truncate">{client.name}</p>
            <div className="flex items-center gap-1.5">
              <Pill tone={client.status === "active" ? "outline" : "muted"}>{client.status === "active" ? "Active" : "Not sent yet"}</Pill>
              {client.accessPaused && <Pill tone="warning">Paused</Pill>}
            </div>
          </div>
          {client.status === "active" ? (
            <>
              <button
                onClick={() => startViewAsClient(client.id)}
                aria-label="View as client"
                title="Browse and act in the app exactly as this client"
                className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0"
              >
                <Repeat size={15} className="text-blue-700" />
              </button>
              <button
                onClick={() => setClientAccessPaused(client.id, !client.accessPaused)}
                aria-label={client.accessPaused ? "Resume access" : "Pause access"}
                title={client.accessPaused ? "Resume access" : "Pause access (e.g. insufficient payment)"}
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${client.accessPaused ? "bg-red-50" : "bg-black/8"}`}
              >
                {client.accessPaused ? <Unlock size={15} className="text-red-700" /> : <Lock size={15} className="text-black/50" />}
              </button>
              <button
                onClick={() => setMessaging(true)}
                className="w-9 h-9 rounded-full bg-black/8 flex items-center justify-center shrink-0"
              >
                <MessageCircle size={15} className="text-black/70" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setSendOpen(true)}
              className="flex items-center gap-1.5 bg-black text-white text-xs font-bold px-3 py-2 rounded-lg shrink-0"
            >
              <Send size={13} /> Send
            </button>
          )}
        </div>
        <div className="flex gap-1.5 px-3 pb-2.5 overflow-x-auto no-scrollbar">
          {CLIENT_NAV.map((item) => {
            const Icon = item.icon;
            const active = clientTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setClientTab(item.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  active ? "bg-black text-white" : "bg-black/8 text-black/60"
                }`}
              >
                <Icon size={13} strokeWidth={active ? 2.4 : 2} /> {item.label}
              </button>
            );
          })}
        </div>
        {!confirmRemove ? (
          <button onClick={() => setConfirmRemove(true)} className="block px-3 pb-2.5 text-black/30 text-[11px] font-medium">
            Remove client
          </button>
        ) : (
          <div className="flex gap-1.5 px-3 pb-2.5">
            <button onClick={() => setConfirmRemove(false)} className="flex-1 bg-black/8 text-black text-xs font-semibold py-1.5 rounded-lg">
              Cancel
            </button>
            <button
              onClick={() => {
                removeClient(client.id);
                showToast("Client removed");
                onClose();
              }}
              className="flex-1 bg-red-500/20 text-red-500 text-xs font-semibold py-1.5 rounded-lg"
            >
              Confirm remove
            </button>
          </div>
        )}
      </div>

      {/* main panel */}
      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">
        {clientTab === "summary" && <SummaryPanel client={client} showToast={showToast} onSendLogin={() => setSendOpen(true)} />}
        {clientTab === "calendar" && <CalendarPanel client={client} showToast={showToast} />}
        {clientTab === "program" && <TrainingProgramPanel client={client} showToast={showToast} />}
        {clientTab === "nutrition" && <NutritionPanel client={client} showToast={showToast} />}
        {clientTab === "progress" && <ProgressPanel client={client} />}
        {clientTab === "habits" && <HabitsPanel client={client} />}
        {clientTab === "checkins" && <CheckInsPanel client={client} showToast={showToast} />}
        {clientTab === "profile" && <ProfilePanel client={client} showToast={showToast} />}
      </div>

      {messaging && <ThreadView client={client} onClose={() => setMessaging(false)} />}
      <SendLoginSheet open={sendOpen} onClose={() => setSendOpen(false)} client={client} showToast={showToast} />
    </div>
  );
}
