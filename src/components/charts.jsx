import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { MEASURE_BLUE } from "../theme";
import { Card } from "./ui";

// Split out of ui.jsx on purpose: ui.jsx is imported eagerly by the login
// screen (for Logo, buttons, etc.), and recharts is a large charting
// library that was being pulled into that eager bundle just for this one
// sparkline — even though every real caller of it (ClientApp.jsx) is
// already behind its own lazy-loaded route chunk.
export function Sparkline({ data, dataKey = "value", height = 36 }) {
  if (!data || data.length < 2) {
    return <div style={{ height }} className="flex items-end"><div className="w-full h-px bg-black/10" /></div>;
  }
  const gradId = `spark-${dataKey}-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={MEASURE_BLUE} stopOpacity={0.35} />
              <stop offset="100%" stopColor={MEASURE_BLUE} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey={dataKey} stroke={MEASURE_BLUE} strokeWidth={2} fill={`url(#${gradId})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MetricTile({ label, value, date, series, onClick, dark = false }) {
  return (
    <Card onClick={onClick} className="!p-4 flex flex-col justify-between min-h-[128px]" dark={dark}>
      <div>
        <p className={`text-[13px] font-medium ${dark ? "text-white/50" : "text-black/50"}`}>{label}</p>
        {date && <p className={`text-[11px] mt-0.5 ${dark ? "text-white/25" : "text-black/25"}`}>{date}</p>}
      </div>
      <div>
        <p className={`text-2xl font-bold tabular-nums leading-none mb-2 ${dark ? "text-white" : "text-black"}`}>{value ?? "···"}</p>
        {series ? <Sparkline data={series} /> : <div className="h-9" />}
      </div>
    </Card>
  );
}
