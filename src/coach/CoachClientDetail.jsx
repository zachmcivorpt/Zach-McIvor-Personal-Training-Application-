import React, { useMemo, useRef, useState } from "react";
import { useApp, getCurrentPhase, programPhases } from "../lib/AppContext";
import { Pill, TextInput, TextArea, Select, PrimaryButton, SecondaryButton, DangerButton, Avatar, BottomSheet, FullScreenOverlay } from "../components/ui";
import { DEFAULT_NUTRITION_TARGETS, macroGrams, adjustMacroPct } from "../lib/nutritionTargets";
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
  Watch,
  Activity,
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
      const newStart = new Date();
      const newEnd = new Date(newStart);
      newEnd.setDate(newEnd.getDate() + spanDays);
      setForm({
        name: `${phase.name} (copy)`,
        startDate: newStart.toISOString().slice(0, 10),
        endDate: newEnd.toISOString().slice(0, 10),
      });
    }
  }, [phase]);

  if (!phase || !form) return null;

  return (
    <BottomSheet open={open} onClose={onClose} title="Duplicate & Schedule Phase">
      <p className="text-black/50 text-sm mb-4">
        Makes a full copy of "{phase.name}" with its own workouts, ready to tweak — set when it should run.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onDuplicate(form);
        }}
        className="space-y-4"
      >
        <div>
          <p className="text-black/40 text-xs tracking-wide mb-1.5">NEW PHASE NAME</p>
          <TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-black/40 text-xs tracking-wide mb-1.5">START DATE</p>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              className="w-full bg-black/8 border border-black/10 rounded-xl px-3.5 py-2.5 text-black text-sm outline-none"
            />
          </div>
          <div>
            <p className="text-black/40 text-xs tracking-wide mb-1.5">END DATE</p>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              className="w-full bg-black/8 border border-black/10 rounded-xl px-3.5 py-2.5 text-black text-sm outline-none"
            />
          </div>
        </div>
        <PrimaryButton type="submit" className="w-full">
          <Copy size={16} /> DUPLICATE & SCHEDULE
        </PrimaryButton>
      </form>
    </BottomSheet>
  );
}

const CAL_WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
                {presetPayload.exercises.length} exercise{presetPayload.exercises.length === 1 ? "" : "s"}
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
                      {w.label} · {w.exercises.length} exercise{w.exercises.length === 1 ? "" : "s"}
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
                  {customDay ? `${customDay.label} · ${customDay.exercises.length} exercises` : "Tap to build this workout"}
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
                        : "bg-emerald-50 border border-emerald-100"
                    }`}
                  >
                    {it.type === "workout" &&
                      (it.done ? <CheckCircle2 size={15} className="text-emerald-600" /> : <Dumbbell size={15} className="text-blue-500" />)}
                    {it.type === "bodystats" && <Scale size={15} className="text-amber-600" />}
                    {it.type === "form" && <NotebookPen size={15} className="text-emerald-600" />}
                    {it.type === "habits" && <ListChecks size={15} className="text-purple-600" />}
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
                        ? `Daily habits · ${it.doneCount}/${it.total} done`
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

function CalendarPanel({ client, showToast }) {
  const { db, unscheduleWorkout, unscheduleBodyStatsCheckin } = useApp();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(now.getUTCMonth());
  const [selectedDate, setSelectedDate] = useState(null);
  const [scheduleKind, setScheduleKind] = useState(null); // "workout" | "bodystats" | "form" | null

  const scheduledWorkouts = (db.scheduledWorkouts || {})[client.id] || [];
  const bodyStatsSchedules = (db.bodyStatsSchedules || {})[client.id] || [];
  const formSchedules = (db.formSchedules || {})[client.id] || [];
  const forms = db.forms || [];
  const weighIns = (db.weighIns || {})[client.id] || [];
  const habits = (db.habits || {})[client.id] || [];
  const habitLogForClient = (db.habitLog || {})[client.id] || {};
  const workoutLogs = (db.workoutLogs || {})[client.id] || [];
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
  const activeFormSchedules = useMemo(() => formSchedules.filter((s) => s.active), [formSchedules]);
  const formsById = useMemo(() => Object.fromEntries(forms.map((f) => [f.id, f])), [forms]);

  const weeks = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const todayStr = dKey(now);

  function itemsForDate(date) {
    const dateStr = dKey(date);
    const items = [];
    const completedLog = completedWorkoutsByDate[dateStr];
    const w = workoutsByDate[dateStr];
    if (w) items.push({ type: "workout", label: w.label, done: !!completedLog, log: completedLog });
    else if (completedLog) items.push({ type: "workout", label: completedLog.dayLabel || "Workout Completed", done: true, log: completedLog });
    const b = bodyStatsByDate[dateStr];
    if (b) items.push({ type: "bodystats", label: "Track Body Stats", done: weighInDates.has(dateStr) });
    activeFormSchedules
      .filter((s) => s.dayOfWeek === date.getUTCDay())
      .forEach((s) => items.push({ type: "form", label: formsById[s.formId]?.name || "Check-in" }));
    // Habits aren't scheduled per day (they're a fixed daily list) — show
    // real completion for today/past days only, never a fake "due" state
    // for future dates.
    if (habits.length > 0 && dateStr <= todayStr) {
      const completedIds = habitLogForClient[dateStr] || [];
      const doneCount = habits.filter((h) => completedIds.includes(h.id)).length;
      items.push({ type: "habits", label: "Daily Habits", done: doneCount === habits.length, doneCount, total: habits.length });
    }
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

  const selectedItems = selectedDate ? itemsForDate(new Date(selectedDate + "T00:00:00Z")) : [];

  return (
    <div className="px-4 py-5 md:px-6 md:py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => shiftMonth(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-black/8 hover:bg-black/15 text-black/60">
            <ChevronRight size={15} className="rotate-180" />
          </button>
          <p className="text-black font-semibold text-sm w-36 text-center">
            {new Date(Date.UTC(viewYear, viewMonth, 1)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}
          </p>
          <button onClick={() => shiftMonth(1)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-black/8 hover:bg-black/15 text-black/60">
            <ChevronRight size={15} />
          </button>
        </div>
        <button onClick={goToday} className="text-blue-600 hover:text-blue-700 text-xs font-semibold">
          Today
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {CAL_WEEKDAY_LABELS.map((l) => (
          <p key={l} className="text-black/35 text-[10px] font-semibold text-center tracking-wide">
            {l}
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
              const items = itemsForDate(date);
              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`min-h-[64px] md:min-h-[78px] rounded-lg border text-left px-1.5 py-1.5 transition-colors ${
                    inMonth ? "bg-white border-black/8 hover:bg-black/[0.03]" : "bg-black/[0.02] border-transparent"
                  }`}
                >
                  <span
                    className={`text-[11px] font-semibold inline-flex items-center justify-center w-5 h-5 rounded-full ${
                      isToday ? "bg-black text-white" : inMonth ? "text-black/60" : "text-black/25"
                    }`}
                  >
                    {date.getUTCDate()}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {items.slice(0, 3).map((it, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-1 text-[9px] md:text-[10px] font-medium truncate rounded px-1 py-0.5 ${
                          it.type === "workout"
                            ? it.done
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-blue-50 text-blue-700"
                            : it.type === "bodystats"
                            ? "bg-amber-50 text-amber-700"
                            : it.type === "habits"
                            ? "bg-purple-50 text-purple-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {it.type === "workout" && it.done && <CheckCircle2 size={9} className="shrink-0" />}
                        <span className="truncate">{it.label}</span>
                      </div>
                    ))}
                    {items.length > 3 && <p className="text-black/30 text-[9px]">+{items.length - 3} more</p>}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 mt-4">
        {[
          ["bg-blue-50 text-blue-700", "Workout"],
          ["bg-amber-50 text-amber-700", "Body Stats"],
          ["bg-emerald-50 text-emerald-700", "Check-in Form"],
          ["bg-purple-50 text-purple-700", "Daily Habits"],
        ].map(([cls, label]) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded ${cls.split(" ")[0]}`} />
            <span className="text-black/40 text-[11px]">{label}</span>
          </div>
        ))}
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
    </div>
  );
}

// Same estimate the client-side preview uses, so a workout never shows a
// different "est. time" depending on which side of the app you're on.
function estimateWorkoutMinutes(exercises) {
  return Math.max(5, Math.round((exercises || []).reduce((a, e) => a + e.targetSets * (45 + (e.restSeconds ?? 90)), 0) / 60));
}

// Read-only look at one workout day — title, est. time, exercise count and
// equipment up top (same info a client sees on their side), plus a quick
// "schedule this" shortcut so the coach doesn't have to leave the preview
// and re-find the workout in the separate Schedule sheet.
function DayPreviewSheet({ day, exercises, onClose, onSchedule, onEdit }) {
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
              <Dumbbell size={15} /> {day.exercises.length} exercise{day.exercises.length === 1 ? "" : "s"}
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
              return (
                <div key={i} className="flex items-center justify-between gap-3 py-3.5 border-b border-black/5">
                  <div className="min-w-0 flex-1">
                    <p className="text-black font-semibold text-[15px] truncate">{ex.name}</p>
                    <p className="text-black/45 text-[13px] mt-0.5">
                      {e.targetSets} sets × {e.targetReps === "AMRAP" ? "AMRAP" : `${e.targetReps} Repetitions`} · RIR {e.targetRIR ?? 2}
                    </p>
                  </div>
                  <span className="text-black/30 text-xs shrink-0">{ex.equipment}</span>
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
    const newDay = {
      id: `d_${Date.now()}`,
      label: masterWorkout.label,
      muscleGroups: masterWorkout.muscleGroups || [],
      exercises: JSON.parse(JSON.stringify(masterWorkout.exercises || [])),
      instructions: masterWorkout.instructions || "",
    };
    setEditingWorkout({ dayIndex: days.length, day: newDay });
    setLibraryPickerOpen(false);
  }

  function saveWorkout(day) {
    if (!phase) return;
    const nextDays = [...days];
    if (editingWorkout.dayIndex < nextDays.length) {
      nextDays[editingWorkout.dayIndex] = day;
    } else {
      nextDays.push(day);
    }
    updateClientPhase(client.id, phase.id, { weeks: [{ ...(phase.weeks[0] || { id: "w1", label: "Week 1" }), days: nextDays }] });
    setEditingWorkout(null);
    showToast("Workout saved");
  }

  function deleteWorkout(i) {
    if (!phase) return;
    const nextDays = days.filter((_, idx) => idx !== i);
    updateClientPhase(client.id, phase.id, { weeks: [{ ...(phase.weeks[0] || { id: "w1", label: "Week 1" }), days: nextDays }] });
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
                      <p className="text-black font-medium text-sm truncate">{d.label}</p>
                      <p className="text-black/35 text-xs truncate">
                        est. {estimateWorkoutMinutes(d.exercises)} min · {d.exercises.length} exercise{d.exercises.length === 1 ? "" : "s"}
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
                    {w.exercises.length} exercise{w.exercises.length === 1 ? "" : "s"}
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

function HabitsPanel({ client }) {
  const { db, addHabit, removeHabit } = useApp();
  const [label, setLabel] = useState("");
  const habits = (db.habits || {})[client.id] || [];
  const existingLabels = new Set(habits.map((h) => h.label.toLowerCase()));
  const presets = (db.habitPresets || []).map((p) => p.label);

  function submit(e) {
    e.preventDefault();
    if (!label.trim()) return;
    addHabit(client.id, label);
    setLabel("");
  }

  return (
    <div className="max-w-xl px-4 py-5 md:px-6 md:py-6">
      <p className="text-black font-semibold mb-4">Daily Habits</p>
      {habits.length > 0 && (
        <div className="space-y-1.5 mb-4">
          {habits.map((h) => (
            <div key={h.id} className="flex items-center justify-between bg-black/5 rounded-xl px-3.5 py-2.5">
              <span className="text-black text-sm">{h.label}</span>
              <button onClick={() => removeHabit(client.id, h.id)} className="w-7 h-7 flex items-center justify-center text-black/30">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="flex gap-2 mb-3">
        <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Stretch for 10 minutes" className="flex-1" />
        <button type="submit" className="w-11 h-11 shrink-0 rounded-xl bg-black text-white flex items-center justify-center">
          <Plus size={18} />
        </button>
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

function NutritionTargetsCard({ client, showToast }) {
  const { updateUser } = useApp();
  const saved = { ...DEFAULT_NUTRITION_TARGETS, ...(client.nutritionTargets || {}) };
  const [calories, setCalories] = useState(saved.calories);
  const [pcts, setPcts] = useState({ protein: saved.proteinPct, carbs: saved.carbsPct, fat: saved.fatPct });
  const [saving, setSaving] = useState(false);
  const loadedRef = useRef(client.id);

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
    <div className="bg-black/[0.03] border border-black/8 rounded-2xl p-4 mb-5">
      <p className="text-black font-semibold mb-1">Nutrition Targets</p>
      <p className="text-black/40 text-xs mb-4">What this client sees as their daily calorie and macro goals in the app.</p>

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
  );
}

function NutritionPanel({ client, showToast }) {
  const { db, setNutritionForDate } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  const todayDateKey = new Date().toISOString().slice(0, 10);
  const nutrition = (db.nutritionLogs[client.id] || []).find((n) => n.date === todayDateKey);

  return (
    <div className="max-w-xl px-4 py-5 md:px-6 md:py-6">
      <NutritionTargetsCard client={client} showToast={showToast} />
      <p className="text-black font-semibold mb-4">Today's Nutrition Log</p>
      {!nutrition ? (
        <p className="text-black/30 text-sm">Nothing logged yet.</p>
      ) : (
        <div className="bg-black/5 border border-black/8 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
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
  );
}

export function WorkoutLogCard({ log, exercisesById, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const hasFlags = log.entries.some((e) => e.note || e.swapReason);
  const prCount = log.entries.reduce((a, e) => a + e.sets.filter((s) => s.isPR).length, 0);
  return (
    <div className="bg-black/[0.03] border border-black/8 rounded-xl overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-3.5 py-3 text-left">
        <div>
          <p className="text-black text-sm font-semibold">{log.dayLabel}</p>
          <p className="text-black/40 text-xs mt-0.5">
            {new Date(log.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
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
  const exercisesById = Object.fromEntries(db.exercises.map((e) => [e.id, e]));

  return (
    <div className="max-w-3xl px-4 py-5 md:px-6 md:py-6 space-y-6">
      <div>
        <p className="text-black font-semibold mb-4">Progress Photos</p>
        {photos.length === 0 ? (
          <p className="text-black/30 text-sm">No photos uploaded by this client yet.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {photos.map((p) => (
              <div key={p.id} className="aspect-square rounded-xl overflow-hidden bg-black/5">
                <img src={p.url} alt="Progress" className="w-full h-full object-cover" />
              </div>
            ))}
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* left: stats, tags, integrations */}
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

          <div>
            <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-2">CONNECTED DEVICES</p>
            <div className="space-y-1.5">
              {[
                { name: "Apple Watch", icon: Watch },
                { name: "Fitbit", icon: Activity },
                { name: "MyFitnessPal", icon: Utensils },
                { name: "Withings", icon: Scale },
              ].map(({ name, icon: Icon }) => (
                <div key={name} className="flex items-center gap-2.5 bg-black/[0.03] rounded-lg px-3 py-2.5">
                  <Icon size={14} className="text-black/30 shrink-0" />
                  <span className="text-black/60 text-xs font-medium flex-1">{name}</span>
                  <span className="text-black/25 text-[11px]">Not available yet</span>
                </div>
              ))}
            </div>
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

function ProfilePanel({ client }) {
  const prefs = client.preferences || {};
  const hasAnyPrefs =
    prefs.goals || (prefs.equipment || []).length || (prefs.trainingDays || []).length || prefs.sessionLength || prefs.trainingNotes || prefs.dietType || prefs.nutritionNotes;

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-5">
        <Avatar name={client.name} url={client.avatarUrl} size={56} />
        <div className="min-w-0">
          <p className="text-black font-bold text-lg truncate">{client.name}</p>
          <p className="text-black/40 text-sm truncate">{client.email}</p>
        </div>
      </div>

      {!hasAnyPrefs ? (
        <p className="text-black/30 text-sm">This client hasn't set any preferences yet.</p>
      ) : (
        <div className="space-y-5">
          {prefs.goals && (
            <div>
              <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-2 flex items-center gap-1.5">
                <Target size={12} /> GOALS
              </p>
              <p className="text-black text-sm bg-black/[0.03] border border-black/8 rounded-xl px-4 py-3">{prefs.goals}</p>
            </div>
          )}

          {(prefs.equipment || []).length > 0 && (
            <div>
              <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-2 flex items-center gap-1.5">
                <Dumbbell size={12} /> EQUIPMENT
              </p>
              <div className="flex flex-wrap gap-1.5">
                {prefs.equipment.map((e) => (
                  <Pill key={e} tone="outline">
                    {e}
                  </Pill>
                ))}
              </div>
            </div>
          )}

          {(prefs.trainingDays?.length || prefs.sessionLength || prefs.trainingNotes) && (
            <div>
              <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-2">TRAINING PREFERENCES</p>
              <div className="bg-black/[0.03] border border-black/8 rounded-xl p-4 space-y-2.5">
                {prefs.trainingDays?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {prefs.trainingDays.map((d) => (
                      <Pill key={d}>{d}</Pill>
                    ))}
                  </div>
                )}
                {prefs.sessionLength && <p className="text-black/70 text-sm">Preferred session length: {prefs.sessionLength}</p>}
                {prefs.trainingNotes && <p className="text-black text-sm">{prefs.trainingNotes}</p>}
              </div>
            </div>
          )}

          {(prefs.dietType || prefs.nutritionNotes) && (
            <div>
              <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-2">NUTRITION PREFERENCES</p>
              <div className="bg-black/[0.03] border border-black/8 rounded-xl p-4 space-y-2.5">
                {prefs.dietType && <Pill tone="outline">{prefs.dietType}</Pill>}
                {prefs.nutritionNotes && <p className="text-black text-sm">{prefs.nutritionNotes}</p>}
              </div>
            </div>
          )}
        </div>
      )}
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
  const { db, removeClient } = useApp();
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
              <Pill tone={client.status === "active" ? "outline" : "muted"}>{client.status === "active" ? "Active" : "Not sent yet"}</Pill>
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
            <Pill tone={client.status === "active" ? "outline" : "muted"}>{client.status === "active" ? "Active" : "Not sent yet"}</Pill>
          </div>
          {client.status === "active" ? (
            <button
              onClick={() => setMessaging(true)}
              className="w-9 h-9 rounded-full bg-black/8 flex items-center justify-center shrink-0"
            >
              <MessageCircle size={15} className="text-black/70" />
            </button>
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
      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto md:overflow-visible">
        {clientTab === "summary" && <SummaryPanel client={client} showToast={showToast} onSendLogin={() => setSendOpen(true)} />}
        {clientTab === "calendar" && <CalendarPanel client={client} showToast={showToast} />}
        {clientTab === "program" && <TrainingProgramPanel client={client} showToast={showToast} />}
        {clientTab === "nutrition" && <NutritionPanel client={client} showToast={showToast} />}
        {clientTab === "progress" && <ProgressPanel client={client} />}
        {clientTab === "habits" && <HabitsPanel client={client} />}
        {clientTab === "checkins" && <CheckInsPanel client={client} showToast={showToast} />}
        {clientTab === "profile" && <ProfilePanel client={client} />}
      </div>

      {messaging && <ThreadView client={client} onClose={() => setMessaging(false)} />}
      <SendLoginSheet open={sendOpen} onClose={() => setSendOpen(false)} client={client} showToast={showToast} />
    </div>
  );
}
