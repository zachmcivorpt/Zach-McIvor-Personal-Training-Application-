import React, { useMemo, useState } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Trophy } from "lucide-react";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme } from "./SoloThemeContext";
import { Card } from "../components/ui";
import {
  BODY_FAT_CONFIG,
  LEAN_MASS_CONFIG,
  BODY_MEASUREMENTS_CONFIG,
  buildBodyMetricEntries,
  LogBodyMetricSheet,
  BodyMetricHistoryScreen,
  BodyMetricCard,
  BodyMeasurementsListCard,
  ConsistencyHeatmap,
} from "../components/ProgressWidgets";
import {
  computeWeeklyVolume,
  computeWorkoutsSeries,
  computePersonalBests,
  computePRsInLastNDays,
  computeMonthlyVolume,
  computeAchievements,
  computePerformanceTimeline,
  trendDirection,
} from "../lib/trainingStats";
import { localDateKey } from "../lib/dateKey";
import { fileToCompressedDataUrl } from "../lib/image";
import { MetricTile } from "../components/charts";
import { MEASURE_BLUE } from "../theme";
import {
  ClientThemeContext,
  LogWeightSheet,
  WeightHistoryScreen,
  ChartCard,
  MetricDetailSheet,
  PhotosSection,
  PerformanceTimelineCard,
  BODY_METRICS_CONFIG,
} from "../client/ClientApp";

const axisStyleFor = (dark) => ({ fontSize: 11, fill: dark ? "rgba(255,255,255,0.35)" : "rgba(10,10,11,0.35)" });

// Consecutive calendar days (back from today) with at least one logged
// workout. Coaching's computeWorkoutStreak instead counts consecutive
// *scheduled* days hit — meaningless here, since a self-guided customer
// has no coach-assigned schedule, only the program's own day order. This
// is the one genuinely Solo-specific adaptation; everything else on this
// screen reuses Coaching's real functions/components as-is.
function computeDayStreak(logs) {
  if (!logs.length) return 0;
  const days = new Set(logs.map((l) => localDateKey(l.date)));
  const cursor = new Date();
  if (!days.has(localDateKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(localDateKey(cursor.getTime()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Train Solo's own Progress tab — reuses the coached-client Progress tab's
// real components and logic as-is (PerformanceTimelineCard, MetricTile,
// ConsistencyHeatmap, PhotosSection, BodyMetricCard/BodyMeasurementsListCard,
// the weight chart, achievements, personal bests — all either already
// shared standalone modules or newly-exported, unmodified, from
// ClientApp.jsx), backed by Train Solo's own soloWeighIns/soloWorkoutLogs/
// soloProgressPhotos/soloBodyMetrics collections. Deliberately excludes
// WhoopCard — there's no wearable-integration infrastructure for Train
// Solo, and "Training Consistency"/"Current Streak" (Coaching's versions
// need a coach-assigned schedule, which self-guided customers don't have)
// are replaced with a day-streak tile computed directly from logged
// workouts. ClientThemeContext.Provider is what makes every reused
// component honor Train Solo's own light/dark toggle.
export default function SoloProgressScreen() {
  const {
    soloCurrentUser,
    soloWeighIns,
    soloWorkoutLogs,
    soloExercises,
    soloProgressPhotos,
    soloBodyMetrics,
    logSoloWeight,
    deleteSoloWeighIn,
    addSoloProgressPhoto,
    deleteSoloProgressPhoto,
    logSoloBodyMetric,
    deleteSoloBodyMetric,
  } = useSoloApp();
  const { dark } = useSoloTheme();
  const [openMetric, setOpenMetric] = useState(null);
  const [weightHistoryOpen, setWeightHistoryOpen] = useState(false);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [logMetricConfig, setLogMetricConfig] = useState(null);
  const [historyMetricConfig, setHistoryMetricConfig] = useState(null);
  const [uploading, setUploading] = useState(false);

  const exercisesById = useMemo(() => Object.fromEntries(soloExercises.map((e) => [e.id, e])), [soloExercises]);

  const bodyMetricEntries = useMemo(
    () => buildBodyMetricEntries(soloBodyMetrics, [...BODY_METRICS_CONFIG, BODY_FAT_CONFIG, LEAN_MASS_CONFIG, ...BODY_MEASUREMENTS_CONFIG]),
    [soloBodyMetrics]
  );

  const weeklyVolume = useMemo(() => computeWeeklyVolume(soloWorkoutLogs), [soloWorkoutLogs]);
  const personalBests = useMemo(() => computePersonalBests(soloWorkoutLogs, exercisesById), [soloWorkoutLogs, exercisesById]);
  const achievements = useMemo(
    () => computeAchievements(soloWorkoutLogs, soloWeighIns, exercisesById),
    [soloWorkoutLogs, soloWeighIns, exercisesById]
  );
  // No scheduledWorkouts concept in Train Solo — self-guided customers
  // follow a program's own day order, not a coach-assigned calendar, so
  // this is always passed as [].
  const timeline = useMemo(
    () => computePerformanceTimeline(soloWorkoutLogs, soloWeighIns, exercisesById, 30, []),
    [soloWorkoutLogs, soloWeighIns, exercisesById]
  );
  const monthlyVolume = useMemo(() => computeMonthlyVolume(soloWorkoutLogs), [soloWorkoutLogs]);
  const prevMonthlyVolume = useMemo(() => computeMonthlyVolume(soloWorkoutLogs, 1), [soloWorkoutLogs]);

  const tiles = useMemo(() => {
    const workoutsSeries = computeWorkoutsSeries(soloWorkoutLogs);
    const now = Date.now();
    const thisWeek = soloWorkoutLogs.filter((l) => now - l.date <= 7 * 24 * 60 * 60 * 1000).length;
    return [
      { key: "workouts", label: "Workouts Completed", unit: "", decimals: 0, series: workoutsSeries, latest: soloWorkoutLogs.length, date: "all-time" },
      { key: "streak", label: "Day Streak", unit: "", decimals: 0, series: null, latest: computeDayStreak(soloWorkoutLogs), date: "consecutive days trained" },
      { key: "thisWeek", label: "This Week", unit: "", decimals: 0, series: null, latest: thisWeek, date: thisWeek === 1 ? "session so far" : "sessions so far" },
      { key: "prs", label: "Personal Bests", unit: "", decimals: 0, series: null, latest: computePRsInLastNDays(soloWorkoutLogs, 30), date: "this month" },
    ];
  }, [soloWorkoutLogs]);

  const latestWeighIn = soloWeighIns[soloWeighIns.length - 1];
  const firstWeighIn = soloWeighIns[0];
  const weightChange = latestWeighIn && firstWeighIn ? Math.round((latestWeighIn.weight - firstWeighIn.weight) * 10) / 10 : null;
  const weightChartData = soloWeighIns.map((w) => ({
    date: new Date(w.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    value: w.weight,
  }));

  async function handleAddPhoto(files, dateKey) {
    setUploading(true);
    try {
      for (const file of files) {
        try {
          const dataUrl = await fileToCompressedDataUrl(file);
          await addSoloProgressPhoto(soloCurrentUser.id, dataUrl, "", dateKey);
        } catch {
          // skip a bad file in the batch — keep going with the rest
        }
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <ClientThemeContext.Provider value={dark}>
      <div className="pb-10">
        <div className="px-3 pt-5 pb-2">
          <h1 className="text-xl font-extrabold">Progress</h1>
        </div>

        <PerformanceTimelineCard timeline={timeline} monthlyVolume={monthlyVolume} prevMonthlyVolume={prevMonthlyVolume} />

        <div className="px-3 space-y-4 mt-4 max-w-md mx-auto">
          <div>
            <p className={dark ? "text-white font-semibold mb-3" : "text-black font-semibold mb-3"}>My Progress</p>
            <div className="grid grid-cols-2 gap-3">
              {tiles.map((t) => (
                <MetricTile
                  dark={dark}
                  key={t.key}
                  label={t.label}
                  date={t.date}
                  value={typeof t.latest === "number" ? `${t.latest.toFixed(t.decimals)}${t.unit}` : `${t.latest}`}
                  series={t.series}
                  onClick={() => setOpenMetric(t)}
                />
              ))}
            </div>
          </div>

          <Card dark={dark}>
            <p className={dark ? "text-white font-semibold mb-3" : "text-black font-semibold mb-3"}>Strength Personal Bests</p>
            <div className="space-y-2.5">
              {personalBests.map((s) => (
                <div key={s.name} className="flex items-center justify-between">
                  <span className={dark ? "text-white/70 text-sm flex items-center gap-2" : "text-black/70 text-sm flex items-center gap-2"}>
                    <Trophy size={14} className={s.value ? (dark ? "text-white" : "text-black") : dark ? "text-white/25" : "text-black/25"} /> {s.name}
                  </span>
                  <span className={s.value ? (dark ? "text-white text-sm font-semibold" : "text-black text-sm font-semibold") : dark ? "text-white/30 text-xs" : "text-black/30 text-xs"}>
                    {s.value || "Not yet logged"}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <ConsistencyHeatmap logs={soloWorkoutLogs} scheduledWorkouts={[]} dark={dark} />

          <PhotosSection
            photos={soloProgressPhotos}
            onAdd={handleAddPhoto}
            onDelete={(id) => deleteSoloProgressPhoto(id)}
            busy={uploading}
            weighIns={soloWeighIns}
          />

          <Card dark={dark}>
            <div className="flex items-center justify-between">
              <div>
                <p className={dark ? "text-white font-semibold" : "text-black font-semibold"}>Body Weight</p>
                <p className={dark ? "text-white/40 text-xs mt-0.5" : "text-black/40 text-xs mt-0.5"}>
                  {soloWeighIns.length === 0
                    ? "No weigh-ins logged yet"
                    : soloWeighIns.length === 1
                    ? `${latestWeighIn.weight} kg · first log`
                    : `${latestWeighIn.weight} kg · ${weightChange > 0 ? "up" : weightChange < 0 ? "down" : "steady"} ${Math.abs(
                        weightChange
                      )}kg since your first log`}
                </p>
              </div>
              <button
                onClick={() => setQuickLogOpen(true)}
                className={dark ? "w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-white shrink-0" : "w-8 h-8 rounded-full bg-black/8 flex items-center justify-center text-black shrink-0"}
              >
                <span className="text-lg leading-none">+</span>
              </button>
            </div>
            {soloWeighIns.length >= 2 ? (
              <button onClick={() => setWeightHistoryOpen(true)} className="w-full h-40 mt-3 -ml-4 block">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weightChartData}>
                    <defs>
                      <linearGradient id="soloWGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={MEASURE_BLUE} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={MEASURE_BLUE} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={axisStyleFor(dark)} axisLine={false} tickLine={false} />
                    <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={axisStyleFor(dark)} axisLine={false} tickLine={false} width={30} />
                    <Tooltip
                      contentStyle={{
                        background: dark ? "#1C1C1C" : "#FFFFFF",
                        border: dark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(10,10,11,0.1)",
                        borderRadius: 12,
                        fontSize: 12,
                        color: dark ? "#FFFFFF" : "#0A0A0B",
                      }}
                    />
                    <Area type="monotone" dataKey="value" stroke={MEASURE_BLUE} strokeWidth={2} fill="url(#soloWGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </button>
            ) : (
              <button
                onClick={() => setWeightHistoryOpen(true)}
                className={dark ? "w-full mt-3 text-center text-white/30 text-xs py-6 border border-dashed border-white/10 rounded-xl" : "w-full mt-3 text-center text-black/30 text-xs py-6 border border-dashed border-black/10 rounded-xl"}
              >
                {soloWeighIns.length === 0 ? "Log a weight to start your history" : "Log another weigh-in to see a trend"}
              </button>
            )}
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <BodyMetricCard dark={dark} config={BODY_FAT_CONFIG} entries={bodyMetricEntries.bodyFatPct} onLog={setLogMetricConfig} onOpenHistory={setHistoryMetricConfig} />
            <BodyMetricCard dark={dark} config={LEAN_MASS_CONFIG} entries={bodyMetricEntries.leanMassKg} onLog={setLogMetricConfig} onOpenHistory={setHistoryMetricConfig} />
          </div>

          <BodyMeasurementsListCard dark={dark} entriesByKey={bodyMetricEntries} onOpenHistory={setHistoryMetricConfig} onLog={setLogMetricConfig} />

          {BODY_METRICS_CONFIG.map((cfg) => (
            <BodyMetricCard dark={dark} key={cfg.key} config={cfg} entries={bodyMetricEntries[cfg.key]} onLog={setLogMetricConfig} onOpenHistory={setHistoryMetricConfig} />
          ))}

          {weeklyVolume.length >= 2 ? (
            <ChartCard title="Weekly Training Volume" subtitle={`${weeklyVolume[weeklyVolume.length - 1].volume.toLocaleString()} kg this week`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyVolume}>
                  <XAxis dataKey="week" tick={axisStyleFor(dark)} axisLine={false} tickLine={false} />
                  <YAxis tick={axisStyleFor(dark)} axisLine={false} tickLine={false} width={34} />
                  <Tooltip
                    contentStyle={{
                      background: dark ? "#1C1C1C" : "#FFFFFF",
                      border: dark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(10,10,11,0.1)",
                      borderRadius: 12,
                      fontSize: 12,
                      color: dark ? "#FFFFFF" : "#0A0A0B",
                    }}
                  />
                  <Bar dataKey="volume" fill={MEASURE_BLUE} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          ) : (
            <Card dark={dark}>
              <p className={dark ? "text-white font-semibold" : "text-black font-semibold"}>Weekly Training Volume</p>
              <p className={dark ? "text-white/30 text-sm mt-2" : "text-black/30 text-sm mt-2"}>Complete a few more weeks of logged workouts to see your volume trend.</p>
            </Card>
          )}

          <Card dark={dark}>
            <p className={dark ? "text-white font-semibold mb-3" : "text-black font-semibold mb-3"}>Achievements</p>
            {achievements.length === 0 ? (
              <p className={dark ? "text-white/30 text-sm" : "text-black/30 text-sm"}>Complete workouts to start unlocking milestones here.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {achievements.map((a) => (
                  <div key={a.id} className={dark ? "bg-white/5 rounded-xl p-3 flex items-center gap-2.5" : "bg-black/5 rounded-xl p-3 flex items-center gap-2.5"}>
                    <span className="text-xl grayscale">{a.icon}</span>
                    <span className={dark ? "text-white/70 text-xs font-medium" : "text-black/70 text-xs font-medium"}>{a.label}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <MetricDetailSheet metric={openMetric} onClose={() => setOpenMetric(null)} />
        {weightHistoryOpen && (
          <WeightHistoryScreen
            weighIns={soloWeighIns}
            onClose={() => setWeightHistoryOpen(false)}
            onLog={() => setQuickLogOpen(true)}
            onDelete={(id) => deleteSoloWeighIn(id)}
          />
        )}
        <LogWeightSheet
          open={quickLogOpen}
          onClose={() => setQuickLogOpen(false)}
          lastWeight={latestWeighIn?.weight}
          onSave={(w, dateKey) => {
            logSoloWeight(soloCurrentUser.id, w, dateKey);
            setQuickLogOpen(false);
          }}
        />

        {historyMetricConfig && (
          <BodyMetricHistoryScreen
            dark={dark}
            config={historyMetricConfig}
            entries={bodyMetricEntries[historyMetricConfig.key]}
            onClose={() => setHistoryMetricConfig(null)}
            onLog={(v, dateKey) => logSoloBodyMetric(soloCurrentUser.id, dateKey, historyMetricConfig.key, v)}
            onDelete={(dateKey) => deleteSoloBodyMetric(soloCurrentUser.id, dateKey, historyMetricConfig.key)}
          />
        )}
        <LogBodyMetricSheet
          dark={dark}
          open={!!logMetricConfig}
          config={logMetricConfig}
          lastValue={logMetricConfig ? bodyMetricEntries[logMetricConfig.key]?.[bodyMetricEntries[logMetricConfig.key].length - 1]?.value : null}
          onClose={() => setLogMetricConfig(null)}
          onSave={(v, dateKey) => {
            logSoloBodyMetric(soloCurrentUser.id, dateKey, logMetricConfig.key, v);
            setLogMetricConfig(null);
          }}
        />
      </div>
    </ClientThemeContext.Provider>
  );
}
