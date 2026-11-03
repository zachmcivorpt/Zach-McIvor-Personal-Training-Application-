import React, { useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "../components/ui";
import { MEASURE_BLUE } from "../theme";
import { estMaxSeries } from "./estMax";

// Estimated max per lift on Progress (#150), under Strength Personal
// Bests: pick a lift, see its best estimated 1-rep max each session.

const fmtDate = (ts) => new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const kg = (v) => `${Math.round(v)}`;

export function SoloEstMaxChart({ logs, exercisesById, dark }) {
  const lifts = useMemo(() => estMaxSeries(logs || [], exercisesById || {}), [logs, exercisesById]);
  const [pick, setPick] = useState(null);
  const lift = lifts.find((l) => l.exerciseId === pick) || lifts[0];
  const muted = dark ? "rgba(255,255,255,0.5)" : "rgba(10,10,11,0.5)";
  const text = dark ? "#FFFFFF" : "#0A0A0B";
  const axis = { fontSize: 11, fill: dark ? "rgba(255,255,255,0.35)" : "rgba(10,10,11,0.35)" };

  return (
    <Card dark={dark}>
      <div data-testid="est-max-chart">
        <p className="font-semibold" style={{ color: text }}>Estimated Max</p>
        {!lift ? (
          <p className="text-xs mt-1" style={{ color: muted }}>
            Log a lift with weight in two sessions to see your estimated max climb.
          </p>
        ) : (
          <>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 mt-3" role="tablist" aria-label="Lift">
              {lifts.slice(0, 10).map((l) => {
                const on = l.exerciseId === lift.exerciseId;
                return (
                  <button
                    key={l.exerciseId}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setPick(l.exerciseId)}
                    className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
                    style={on ? { background: MEASURE_BLUE, color: "#FFFFFF" } : { background: dark ? "rgba(255,255,255,0.08)" : "rgba(10,10,11,0.06)", color: muted }}
                  >
                    {l.name}
                  </button>
                );
              })}
            </div>
            <div className="flex items-end justify-between mt-4">
              <div>
                <div className="text-[32px] leading-none font-semibold tabular-nums" style={{ color: text }} data-testid="est-max-latest">
                  {kg(lift.latest)}
                  <span className="text-sm font-semibold ml-1" style={{ color: muted }}>kg</span>
                </div>
                <p className="text-xs mt-1" style={{ color: muted }}>
                  {lift.name} · est. 1-rep max
                </p>
              </div>
              <p className="text-sm font-semibold tabular-nums" style={{ color: lift.change > 0 ? MEASURE_BLUE : muted }} data-testid="est-max-change">
                {lift.change > 0 ? "+" : lift.change < 0 ? "−" : ""}
                {kg(Math.abs(lift.change))} kg since {fmtDate(lift.points[0].date)}
              </p>
            </div>
            <div className="h-40 mt-3 -ml-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={lift.points.map((p) => ({ date: fmtDate(p.date), value: p.value }))}>
                  <defs>
                    <linearGradient id="soloEstMaxGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={MEASURE_BLUE} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={MEASURE_BLUE} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={axis} axisLine={false} tickLine={false} />
                  <YAxis domain={["dataMin - 5", "dataMax + 5"]} tickFormatter={kg} tick={axis} axisLine={false} tickLine={false} width={34} />
                  <Tooltip
                    formatter={(v) => [`${kg(v)} kg`, "Est. max"]}
                    contentStyle={{ background: dark ? "#1C1C1C" : "#FFFFFF", border: dark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(10,10,11,0.1)", borderRadius: 12, fontSize: 12, color: text }}
                  />
                  <Area type="monotone" dataKey="value" stroke={MEASURE_BLUE} strokeWidth={2} fill="url(#soloEstMaxGrad)" dot={{ r: 2.5, fill: MEASURE_BLUE, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] mt-1" style={{ color: muted }}>
              Your best set each session, as an estimated 1-rep max (weight × (1 + reps ÷ 30)).
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
