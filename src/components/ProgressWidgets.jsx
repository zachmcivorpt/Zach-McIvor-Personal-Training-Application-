// Shared progress/body-metric widgets used by both the client's own
// Progress tab (ClientApp.jsx) and the coach's web view of a client's
// Progress tab (CoachClientDetail.jsx) — kept in one place so a coach
// looking at a client's stats sees exactly the same graphs the client
// sees on their own phone, instead of two components drifting apart.
import React, { useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Plus, ChevronRight, Ruler, Percent, Activity, Check, X, Trophy } from "lucide-react";
import { Card, BottomSheet, FullScreenOverlay, Field, TextInput, PrimaryButton } from "./ui";
import { MEASURE_BLUE, GOAL_GREEN } from "../theme";
import { localDateKey } from "../lib/dateKey";

export const axisStyle = { fontSize: 11, fill: "rgba(10,10,11,0.35)" };
export const axisStyleDark = { fontSize: 11, fill: "rgba(255,255,255,0.35)" };
const tooltipStyleFor = (dark) =>
  dark
    ? { background: "#1C1C1C", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12, color: "#FFFFFF" }
    : { background: "#FFFFFF", border: "1px solid rgba(10,10,11,0.1)", borderRadius: 12, fontSize: 12, color: "#0A0A0B" };

export const BODY_FAT_CONFIG = { key: "bodyFatPct", label: "Body Fat", unit: "%", icon: Percent, placeholder: "e.g. 18.5" };
export const LEAN_MASS_CONFIG = { key: "leanMassKg", label: "Lean Body Mass", unit: "kg", icon: Activity, placeholder: "e.g. 65.2" };

// The full-body tape-measure set a coach tracks over a training block —
// same set Trainerize's own "Body Measurements" breaks out into, all in cm.
export const BODY_MEASUREMENTS_CONFIG = [
  { key: "neckCm", label: "Neck", unit: "cm", icon: Ruler, placeholder: "e.g. 38" },
  { key: "chestCm", label: "Chest", unit: "cm", icon: Ruler, placeholder: "e.g. 102" },
  { key: "shouldersCm", label: "Shoulders", unit: "cm", icon: Ruler, placeholder: "e.g. 118" },
  { key: "leftBicepCm", label: "Left Bicep", unit: "cm", icon: Ruler, placeholder: "e.g. 35" },
  { key: "rightBicepCm", label: "Right Bicep", unit: "cm", icon: Ruler, placeholder: "e.g. 35" },
  { key: "leftForearmCm", label: "Left Forearm", unit: "cm", icon: Ruler, placeholder: "e.g. 29" },
  { key: "rightForearmCm", label: "Right Forearm", unit: "cm", icon: Ruler, placeholder: "e.g. 29" },
  { key: "waistCm", label: "Waist", unit: "cm", icon: Ruler, placeholder: "e.g. 84" },
  { key: "hipsCm", label: "Hips", unit: "cm", icon: Ruler, placeholder: "e.g. 98" },
  { key: "leftThighCm", label: "Left Thigh", unit: "cm", icon: Ruler, placeholder: "e.g. 58" },
  { key: "rightThighCm", label: "Right Thigh", unit: "cm", icon: Ruler, placeholder: "e.g. 58" },
  { key: "leftCalfCm", label: "Left Calf", unit: "cm", icon: Ruler, placeholder: "e.g. 38" },
  { key: "rightCalfCm", label: "Right Calf", unit: "cm", icon: Ruler, placeholder: "e.g. 38" },
];

// Builds the { [fieldKey]: [{id, date, value}] } lookup every widget below
// reads from, out of the raw per-day bodyMetrics docs for one client.
export function buildBodyMetricEntries(bodyMetrics, configs) {
  const out = {};
  configs.forEach((cfg) => {
    out[cfg.key] = (bodyMetrics || [])
      .filter((m) => m[cfg.key] != null)
      .map((m) => ({ id: m.id, date: m.date, value: m[cfg.key] }))
      .sort((a, b) => a.date.localeCompare(b.date));
  });
  return out;
}

export function LogBodyMetricSheet({ open, onClose, config, lastValue, onSave, dark = false }) {
  const [value, setValue] = useState("");

  React.useEffect(() => {
    if (open) setValue(lastValue != null ? String(lastValue) : "");
  }, [open, lastValue]);

  if (!config) return null;
  const parsed = Number(value);
  const valid = value !== "" && !isNaN(parsed) && parsed >= 0;

  return (
    <BottomSheet open={open} onClose={onClose} title={`Log ${config.label}`} dark={dark}>
      <Field label={`${config.label.toUpperCase()}${config.unit ? ` (${config.unit.toUpperCase()})` : ""}`} dark={dark}>
        <TextInput
          dark={dark}
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={config.placeholder}
          autoFocus
        />
      </Field>
      <PrimaryButton
        dark={dark}
        className="w-full mt-4"
        disabled={!valid}
        onClick={() => {
          onSave(parsed);
          setValue("");
        }}
      >
        <Check size={16} /> SAVE
      </PrimaryButton>
    </BottomSheet>
  );
}

export function BodyMetricHistoryScreen({ config, entries, onClose, onLog, onDelete, dark = false }) {
  const [logOpen, setLogOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const chartData = entries.map((e) => ({ date: new Date(e.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }), value: e.value }));
  const latest = entries[entries.length - 1];
  const first = entries[0];
  const change = latest && first ? Math.round((latest.value - first.value) * 10) / 10 : null;
  const Icon = config.icon;
  const gradId = `bmGrad-${config.key}`;
  const primaryText = dark ? "text-white" : "text-black";
  const muted60 = dark ? "text-white/60" : "text-black/60";
  const muted50 = dark ? "text-white/50" : "text-black/50";
  const muted40 = dark ? "text-white/40" : "text-black/40";
  const muted30 = dark ? "text-white/30" : "text-black/30";
  const muted25 = dark ? "text-white/25" : "text-black/25";
  const muted15 = dark ? "text-white/15" : "text-black/15";
  const divider = dark ? "border-white/8" : "border-black/5";
  const pageBg = dark ? "#090909" : "#FFFFFF";

  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[95] flex flex-col" style={{ backgroundColor: pageBg }}>
        <div className={`flex items-center justify-between px-3 pt-6 pb-3 shrink-0 border-b ${divider}`}>
          <button onClick={onClose} className={muted60}>
            <X size={20} />
          </button>
          <span className={`${primaryText} font-semibold`}>{config.label}</span>
          <button onClick={() => setLogOpen(true)} className={`${primaryText} font-bold text-sm`}>
            + Log
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-5">
          {entries.length === 0 ? (
            <div className="py-16 text-center">
              <Icon size={28} className={`mx-auto ${muted15} mb-3`} />
              <p className={`${muted40} text-sm mb-4`}>No {config.label.toLowerCase()} logged yet.</p>
              <PrimaryButton dark={dark} onClick={() => setLogOpen(true)} className="mx-auto">
                <Plus size={16} /> LOG YOUR FIRST ENTRY
              </PrimaryButton>
            </div>
          ) : (
            <>
              <p className={`${primaryText} text-3xl font-bold tabular-nums`}>
                {latest.value}
                {config.unit ? <span className="text-lg font-semibold"> {config.unit}</span> : ""}
              </p>
              <p className={`${muted40} text-xs mt-1`}>
                {entries.length > 1 && change != null
                  ? `${change > 0 ? "up" : change < 0 ? "down" : "steady"} ${Math.abs(change)}${config.unit} since your first log`
                  : "Your first logged entry"}
              </p>

              {entries.length >= 2 && (
                <div className="h-64 mt-5">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={MEASURE_BLUE} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={MEASURE_BLUE} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={dark ? axisStyleDark : axisStyle} axisLine={false} tickLine={false} />
                      <YAxis
                        domain={["dataMin - 1", "dataMax + 1"]}
                        tick={dark ? axisStyleDark : axisStyle}
                        axisLine={false}
                        tickLine={false}
                        width={34}
                      />
                      <Tooltip contentStyle={tooltipStyleFor(dark)} />
                      <Area type="monotone" dataKey="value" stroke={MEASURE_BLUE} strokeWidth={2} fill={`url(#${gradId})`} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              <p className={`${muted30} text-xs tracking-wide mt-6 mb-2`}>ALL ENTRIES · {entries.length}</p>
              <div className="space-y-1">
                {[...entries].reverse().map((e) => (
                  <div key={e.id} className={`flex items-center justify-between py-2.5 border-b ${divider} last:border-0`}>
                    <span className={`${muted50} text-sm`}>
                      {new Date(e.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className={`${primaryText} font-semibold text-sm`}>
                        {e.value}
                        {config.unit ? ` ${config.unit}` : ""}
                      </span>
                      {confirmDeleteId === e.id ? (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setConfirmDeleteId(null)} className={`${muted40} text-xs font-semibold px-2 py-1`}>
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              // Passed as (dateKey, entryId) — a per-day
                              // bodyMetrics doc deletes by dateKey, while a
                              // weighIns entry (its own doc per log, keyed by
                              // a real timestamp rather than a calendar day)
                              // needs its own id instead; callers use
                              // whichever argument their delete action wants.
                              onDelete?.(e.date, e.id);
                              setConfirmDeleteId(null);
                            }}
                            className={`text-xs font-bold px-2 py-1 rounded-lg ${dark ? "text-red-400 bg-red-500/15" : "text-red-600 bg-red-50"}`}
                          >
                            Delete
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(e.id)} className={`${muted25} hover:text-red-500 p-1`} aria-label="Delete this entry">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <LogBodyMetricSheet
        open={logOpen}
        config={config}
        lastValue={latest?.value}
        onClose={() => setLogOpen(false)}
        onSave={(v) => {
          onLog(v);
          setLogOpen(false);
        }}
        dark={dark}
      />
    </FullScreenOverlay>
  );
}

// Same card/chart treatment as Body Weight — one metric, one inline chart.
// Used for Body Fat % / Lean Body Mass and the handful of daily wellness
// metrics (steps/sleep/heart rate) where a single trend line is the point.
export function BodyMetricCard({ config, entries, onLog, onOpenHistory, dark = false }) {
  const chartData = entries.map((e) => ({ date: new Date(e.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }), value: e.value }));
  const latest = entries[entries.length - 1];
  const first = entries[0];
  const change = latest && first ? Math.round((latest.value - first.value) * 10) / 10 : null;
  const Icon = config.icon;
  const gradId = `bmcGrad-${config.key}`;

  return (
    <Card dark={dark}>
      <div className="flex items-center justify-between">
        <div>
          <p className={`font-semibold flex items-center gap-1.5 ${dark ? "text-white" : "text-black"}`}>
            <Icon size={14} className={dark ? "text-white/40" : "text-black/40"} /> {config.label}
          </p>
          <p className={`text-xs mt-0.5 ${dark ? "text-white/40" : "text-black/40"}`}>
            {entries.length === 0
              ? `No ${config.label.toLowerCase()} logged yet`
              : entries.length === 1
              ? `${latest.value}${config.unit ? ` ${config.unit}` : ""} · first log`
              : `${latest.value}${config.unit ? ` ${config.unit}` : ""} · ${change > 0 ? "up" : change < 0 ? "down" : "steady"} ${Math.abs(
                  change
                )}${config.unit} since your first log`}
          </p>
        </div>
        <button
          onClick={() => onLog(config)}
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
            dark ? "bg-white/8 text-white" : "bg-black/8 text-black"
          }`}
        >
          <Plus size={15} />
        </button>
      </div>
      {entries.length >= 2 ? (
        <button onClick={() => onOpenHistory(config)} className="w-full h-40 mt-3 -ml-4 block">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={MEASURE_BLUE} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={MEASURE_BLUE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={dark ? axisStyleDark : axisStyle} axisLine={false} tickLine={false} />
              <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={dark ? axisStyleDark : axisStyle} axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={tooltipStyleFor(dark)} />
              <Area type="monotone" dataKey="value" stroke={MEASURE_BLUE} strokeWidth={2} fill={`url(#${gradId})`} />
            </AreaChart>
          </ResponsiveContainer>
        </button>
      ) : (
        <button
          onClick={() => onOpenHistory(config)}
          className={`w-full mt-3 text-center text-xs py-6 border border-dashed rounded-xl ${
            dark ? "text-white/30 border-white/15" : "text-black/30 border-black/10"
          }`}
        >
          {entries.length === 0 ? `Log your ${config.label.toLowerCase()} to start your history` : "Log another entry to see a trend"}
        </button>
      )}
    </Card>
  );
}

// Deliberately NOT another twelve inline charts (that's the "not the graph,
// separate — it'd take up too much space" ask) — one compact card listing
// every tape-measure spot with its latest reading, tap through for that
// one measurement's own history + graph via BodyMetricHistoryScreen.
export function BodyMeasurementsListCard({ entriesByKey, onOpenHistory, onLog, dark = false }) {
  return (
    <Card dark={dark}>
      <p className={`font-semibold flex items-center gap-1.5 ${dark ? "text-white" : "text-black"}`}>
        <Ruler size={14} className={dark ? "text-white/40" : "text-black/40"} /> Body Measurements
      </p>
      <p className={`text-xs mt-0.5 mb-2 ${dark ? "text-white/40" : "text-black/40"}`}>
        Neck, chest, arms, waist & more — each with its own history
      </p>
      <div className={dark ? "divide-y divide-white/8" : "divide-y divide-black/5"}>
        {BODY_MEASUREMENTS_CONFIG.map((cfg) => {
          const entries = entriesByKey[cfg.key] || [];
          const latest = entries[entries.length - 1];
          return (
            <div key={cfg.key} className="flex items-center justify-between py-2.5">
              <button onClick={() => onOpenHistory(cfg)} className="flex-1 text-left flex items-center justify-between pr-2">
                <span className={`text-sm ${dark ? "text-white/70" : "text-black/70"}`}>{cfg.label}</span>
                <span className={`flex items-center gap-1.5 text-sm ${dark ? "text-white/40" : "text-black/40"}`}>
                  {latest ? `${latest.value} ${cfg.unit}` : "—"}
                  <ChevronRight size={14} className={dark ? "text-white/25" : "text-black/25"} />
                </span>
              </button>
              <button
                onClick={() => onLog(cfg)}
                aria-label={`Log ${cfg.label}`}
                className={`w-7 h-7 ml-2 rounded-full flex items-center justify-center shrink-0 ${
                  dark ? "bg-white/8 text-white" : "bg-black/8 text-black"
                }`}
              >
                <Plus size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// 30-day training consistency at a glance — green for a day trained, blue
// for a day with a PR, grey otherwise. Shared so the coach's web Progress
// tab shows the exact same heatmap the client sees on their own.
export function ConsistencyHeatmap({ logs, dark = false }) {
  const DAYS = 30;
  const days = useMemo(() => {
    const doneDates = new Set(logs.map((l) => localDateKey(l.date)));
    const prDates = new Set(
      logs.filter((l) => !l.cardio && (l.entries || []).some((e) => (e.sets || []).some((s) => s.isPR))).map((l) => localDateKey(l.date))
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - DAYS + 1);

    const out = [];
    const cursor = new Date(start);
    for (let i = 0; i < DAYS; i++) {
      const dateStr = localDateKey(cursor);
      out.push({ date: dateStr, done: doneDates.has(dateStr), pr: prDates.has(dateStr) });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [logs]);

  return (
    <Card dark={dark}>
      <p className={`font-semibold ${dark ? "text-white" : "text-black"}`}>Consistency Heat Map</p>
      <p className={`text-xs mt-0.5 mb-3 ${dark ? "text-white/40" : "text-black/40"}`}>Every day trained, last {DAYS} days</p>
      <div className="flex gap-[3px]">
        {days.map((day) => (
          <div
            key={day.date}
            title={day.date}
            className="flex-1 aspect-square rounded-[3px]"
            style={{
              backgroundColor: day.pr ? MEASURE_BLUE : day.done ? GOAL_GREEN : dark ? "rgba(255,255,255,0.08)" : "rgba(10,10,11,0.08)",
            }}
          />
        ))}
      </div>
      <div className={`flex items-center gap-3 mt-3 text-[11px] ${dark ? "text-white/35" : "text-black/35"}`}>
        <span className="flex items-center gap-1">
          <span className={`w-2.5 h-2.5 rounded-[2px] inline-block ${dark ? "bg-white/8" : "bg-black/8"}`} /> None
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-[2px] inline-block" style={{ backgroundColor: GOAL_GREEN }} /> Trained
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-[2px] inline-block" style={{ backgroundColor: MEASURE_BLUE }} /> PR
        </span>
      </div>
    </Card>
  );
}

// Strength PR list — same "name / best lift or Not yet logged" row layout
// on both the client's own Progress tab and the coach's web view of it.
export function PersonalBestsCard({ personalBests, dark = false }) {
  return (
    <Card dark={dark}>
      <p className={`font-semibold mb-3 ${dark ? "text-white" : "text-black"}`}>Strength Personal Bests</p>
      <div className="space-y-2.5">
        {personalBests.map((s) => (
          <div key={s.name} className="flex items-center justify-between">
            <span className={`text-sm flex items-center gap-2 ${dark ? "text-white/70" : "text-black/70"}`}>
              <Trophy size={14} className={s.value ? (dark ? "text-white" : "text-black") : dark ? "text-white/25" : "text-black/25"} /> {s.name}
            </span>
            <span
              className={
                s.value
                  ? `text-sm font-semibold ${dark ? "text-white" : "text-black"}`
                  : `text-xs ${dark ? "text-white/30" : "text-black/30"}`
              }
            >
              {s.value || "Not yet logged"}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
