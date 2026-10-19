import React, { useMemo, useState } from "react";
import { Scale, Dumbbell, ChevronRight, Trophy } from "lucide-react";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES } from "./SoloThemeContext";
import { ClientThemeContext, LogWeightSheet, WeightHistoryScreen } from "../client/ClientApp";

// Train Solo's own Progress tab — reuses ClientApp.jsx's real
// LogWeightSheet/WeightHistoryScreen as-is (both already prop-driven, no
// useApp()), backed by the new soloWeighIns collection. Deliberately
// scoped to what's actually meaningful for a self-guided customer with no
// coach: body weight and completed-workout history/volume. Progress
// photos and body-circumference measurements are NOT built here — that's
// real Storage-upload and additional-collection infrastructure this pass
// didn't have room for; this screen covers what it says, not everything
// the coached Progress tab has. ClientThemeContext.Provider is what makes
// the reused weight components honor Train Solo's own light/dark toggle.
export default function SoloProgressScreen() {
  const { soloWeighIns, soloWorkoutLogs, soloCurrentUser, logSoloWeight, deleteSoloWeighIn } = useSoloApp();
  const { dark, accent } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const [weightOpen, setWeightOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const latestWeight = soloWeighIns[soloWeighIns.length - 1];

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = `${lastMonthDate.getFullYear()}-${lastMonthDate.getMonth()}`;
    let monthlyVolume = 0;
    let prevMonthlyVolume = 0;
    let totalPRs = 0;
    for (const log of soloWorkoutLogs) {
      const d = new Date(log.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const volume = (log.entries || []).reduce(
        (sum, e) => sum + (e.sets || []).reduce((s, set) => s + (set.weight || 0) * (set.reps || 0), 0),
        0
      );
      const prCount = (log.entries || []).reduce((sum, e) => sum + (e.sets || []).filter((s) => s.isPR).length, 0);
      if (key === thisMonthKey) monthlyVolume += volume;
      if (key === lastMonthKey) prevMonthlyVolume += volume;
      totalPRs += prCount;
    }
    return { monthlyVolume: Math.round(monthlyVolume), prevMonthlyVolume: Math.round(prevMonthlyVolume), totalPRs };
  }, [soloWorkoutLogs]);

  return (
    <ClientThemeContext.Provider value={dark}>
      <div className="w-full max-w-md mx-auto px-5 pt-5 pb-10">
        <h1 className="text-xl font-extrabold mb-4">Progress</h1>

        <button
          onClick={() => setWeightOpen(true)}
          className="w-full flex items-center justify-between gap-3 rounded-2xl px-4 py-4 text-left mb-4"
          style={{ backgroundColor: t.cardBg, border: `1px solid ${t.panelBorder}` }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: t.chipBg }}>
              <Scale size={17} />
            </div>
            <div>
              <p className="text-sm font-bold">Body Weight</p>
              <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
                {latestWeight ? `${latestWeight.weight} kg · last logged ${new Date(latestWeight.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "No entries yet"}
              </p>
            </div>
          </div>
          <ChevronRight size={16} color={t.textFaint} />
        </button>

        <p className="text-[11px] font-bold tracking-wide uppercase mb-2.5" style={{ color: t.textFaint }}>
          Training
        </p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-2xl p-4" style={{ backgroundColor: t.cardBg, border: `1px solid ${t.panelBorder}` }}>
            <p className="text-xl font-bold tabular-nums">{soloWorkoutLogs.length}</p>
            <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
              Workouts completed
            </p>
          </div>
          <div className="rounded-2xl p-4" style={{ backgroundColor: t.cardBg, border: `1px solid ${t.panelBorder}` }}>
            <p className="text-xl font-bold tabular-nums">{stats.monthlyVolume.toLocaleString()} kg</p>
            <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
              Volume this month
            </p>
          </div>
        </div>

        {stats.totalPRs > 0 && (
          <div className="rounded-2xl p-4 mb-4 flex items-center gap-3" style={{ backgroundColor: t.cardBg, border: `1px solid ${t.panelBorder}` }}>
            <Trophy size={18} color={accent} className="shrink-0" />
            <p className="text-sm font-semibold">{stats.totalPRs} personal record{stats.totalPRs === 1 ? "" : "s"} set so far</p>
          </div>
        )}

        <p className="text-[11px] font-bold tracking-wide uppercase mb-2.5" style={{ color: t.textFaint }}>
          History
        </p>
        {soloWorkoutLogs.length === 0 ? (
          <p className="text-sm" style={{ color: t.textMuted }}>
            Nothing logged yet — complete a workout from My Training to start building your history.
          </p>
        ) : (
          <div className="space-y-2">
            {soloWorkoutLogs.slice(0, 10).map((log) => (
              <div key={log.id} className="flex items-center justify-between rounded-xl px-4 py-3" style={{ backgroundColor: t.cardBg, border: `1px solid ${t.panelBorder}` }}>
                <div className="flex items-center gap-3 min-w-0">
                  <Dumbbell size={15} color={t.textFaint} className="shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{log.dayLabel}</p>
                    <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
                      {new Date(log.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                </div>
                <p className="text-xs font-semibold shrink-0" style={{ color: t.textMuted }}>
                  {log.durationMin} min
                </p>
              </div>
            ))}
          </div>
        )}

        {weightOpen && (
          <WeightHistoryScreen
            weighIns={soloWeighIns}
            onClose={() => setWeightOpen(false)}
            onLog={() => setLogOpen(true)}
            onDelete={(id) => deleteSoloWeighIn(id)}
          />
        )}
        <LogWeightSheet
          open={logOpen}
          onClose={() => setLogOpen(false)}
          lastWeight={latestWeight?.weight}
          onSave={(weight, dateKey) => {
            logSoloWeight(soloCurrentUser.id, weight, dateKey);
            setLogOpen(false);
          }}
        />
      </div>
    </ClientThemeContext.Provider>
  );
}
