// Coach video feedback (#220): the client's week at a glance, in glass —
// rings for planned sessions, nutrition adherence, protein days and steps;
// weight, calories, sleep and kg lifted; a day-by-day grid; best and stuck
// lifts — and the linked check-in's changes since last time. Used beside the
// camera, in Write and in Publish. Figures come from weekScorecard /
// checkinChanges (the client's own data); missing data shows "–".
import { Check, Trophy, TrendingUp, MoveRight } from "lucide-react";
import { MEASURE_BLUE } from "../../theme";

export const CARD_GLASS = {
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.11)",
  backdropFilter: "blur(26px) saturate(140%)",
  WebkitBackdropFilter: "blur(26px) saturate(140%)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 20px 60px -30px rgba(0,0,0,0.8)",
};
const BLUE_GLASS = { background: "rgba(47,143,255,0.10)", border: "1px solid rgba(47,143,255,0.55)", boxShadow: "0 0 16px rgba(47,143,255,0.22)" };

const dash = (v) => (v === null || v === undefined ? "–" : v);
const signed = (n, unit = "") => (n === null || n === undefined ? null : `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n)}${unit}`);
const fmtKey = (key) => new Date(key + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });

export function GlassCard({ children, className = "", padding = 18, style }) {
  return (
    <div className={`rounded-[22px] ${className}`} style={{ ...CARD_GLASS, padding, ...style }}>
      {children}
    </div>
  );
}

export function CardLabel({ children, right }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-white/55">{children}</p>
      {right && <span className="text-white/40 text-[10px] text-right">{right}</span>}
    </div>
  );
}

export function Ring({ pct, label, sub, size = 88 }) {
  const stroke = Math.max(5, Math.round(size / 13));
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const shown = pct === null || pct === undefined ? null : Math.max(0, pct);
  return (
    <div className="flex flex-col items-center text-center min-w-0" data-testid={`ring-${label}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={stroke} />
          {shown !== null && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={MEASURE_BLUE}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${(Math.min(100, shown) / 100) * c} ${c}`}
              style={{ filter: "drop-shadow(0 0 6px rgba(47,143,255,0.6))" }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white font-semibold tabular-nums leading-none" style={{ fontSize: size * 0.26 }}>
            {shown === null ? "–" : shown}
            {shown !== null && <span className="text-white/50" style={{ fontSize: size * 0.13 }}>%</span>}
          </span>
        </div>
      </div>
      <p className="text-white text-[12px] font-semibold mt-2">{label}</p>
      <p className="text-white/50 text-[11px] tabular-nums truncate max-w-full">{sub}</p>
    </div>
  );
}

function Fig({ value, unit, label, delta, good }) {
  return (
    <div className="min-w-0">
      <p className="text-white text-[22px] leading-none font-semibold tabular-nums truncate">
        {dash(value)}
        {value !== null && value !== undefined && unit && <span className="text-white/45 text-[12px] font-medium ml-1">{unit}</span>}
      </p>
      <p className="text-white/50 text-[11px] mt-1.5 truncate">
        {label}
        {delta && (
          <span className="ml-1.5 font-semibold" style={{ color: good ? MEASURE_BLUE : "rgba(255,255,255,0.8)" }}>
            {delta}
          </span>
        )}
      </p>
    </div>
  );
}

export function weekRingsData(week, nutritionScore) {
  return [
    { label: "Sessions", pct: week.sessions.pct, sub: week.sessions.planned ? `${week.sessions.done} of ${week.sessions.planned}` : `${week.sessions.total} done` },
    { label: "Nutrition", pct: week.nutrition.logged ? nutritionScore : null, sub: week.nutrition.logged ? "adherence" : "not logged" },
    { label: "Protein", pct: week.nutrition.logged ? Math.round((week.nutrition.proteinHits / 7) * 100) : null, sub: `${week.nutrition.proteinHits} of 7 days` },
    { label: "Steps", pct: week.steps.pct, sub: week.steps.avg !== null ? `${week.steps.avg.toLocaleString()} avg` : "no data" },
  ];
}

export function WeekRings({ week, nutritionScore, compact = false }) {
  return (
    <GlassCard padding={compact ? 14 : 18}>
      <CardLabel right={`${fmtKey(week.from)} – ${fmtKey(week.to)}`}>This week</CardLabel>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
        {weekRingsData(week, nutritionScore).map((r) => (
          <Ring key={r.label} {...r} size={compact ? 66 : 88} />
        ))}
      </div>
    </GlassCard>
  );
}

export function WeekFigures({ week, targets, columns = 4 }) {
  return (
    <GlassCard>
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}>
        <Fig value={week.weight.avg} unit="kg" label="Weight avg" delta={signed(week.weight.change)} good={week.weight.change !== null && week.weight.change < 0} />
        <Fig value={week.nutrition.avgCalories?.toLocaleString() ?? null} unit="kcal" label={`Avg / ${targets.calories.toLocaleString()}`} />
        <Fig value={week.sleep.avg} unit="h" label="Sleep avg" />
        <Fig value={week.lifted.kg?.toLocaleString() ?? null} unit="kg" label="Lifted" delta={signed(week.lifted.changePct, "%")} good={week.lifted.changePct > 0} />
      </div>
    </GlassCard>
  );
}

function Dot({ state }) {
  if (state === "on") return <span className="w-3 h-3 rounded-full" style={{ background: MEASURE_BLUE, boxShadow: "0 0 8px rgba(47,143,255,0.7)" }} />;
  if (state === "missed") return <span className="w-3 h-3 rounded-full" style={{ border: "1.5px solid rgba(255,255,255,0.5)" }} />;
  if (state === "none") return <span className="text-white/25 text-xs leading-none">–</span>;
  return <span className="w-3 h-3 rounded-full" style={{ background: "rgba(255,255,255,0.10)" }} />;
}

export function DayGrid({ week, compact = false }) {
  const maxSteps = Math.max(week.steps.goal, ...week.days.map((d) => d.steps || 0));
  const rows = [
    ["Session", (d) => <Dot state={d.session === "done" || d.session === "extra" ? "on" : d.session === "missed" ? "missed" : "none"} />],
    ["Calories", (d) => <Dot state={d.calorieHit ? "on" : d.logged ? "off" : "none"} />],
    ["Protein", (d) => <Dot state={d.proteinHit ? "on" : d.logged ? "off" : "none"} />],
    [
      "Steps",
      (d) =>
        d.steps === null ? (
          <Dot state="none" />
        ) : (
          <span className="flex flex-col items-center gap-1">
            <span className="w-2 h-8 rounded-full bg-white/10 overflow-hidden flex items-end">
              <span className="w-full rounded-full" style={{ height: `${Math.max(6, (d.steps / maxSteps) * 100)}%`, background: d.steps >= week.steps.goal ? MEASURE_BLUE : "rgba(255,255,255,0.55)" }} />
            </span>
            {!compact && <span className="text-white/45 text-[9px] tabular-nums">{(d.steps / 1000).toFixed(1)}k</span>}
          </span>
        ),
    ],
  ];
  return (
    <GlassCard>
      <CardLabel
        right={
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: MEASURE_BLUE }} /> hit
            <span className="w-2 h-2 rounded-full border border-white/50" /> missed
          </span>
        }
      >
        Day by day
      </CardLabel>
      <div className="grid" style={{ gridTemplateColumns: "64px repeat(7, minmax(0,1fr))" }} data-testid="day-grid">
        <span />
        {week.days.map((d) => (
          <span key={d.dateKey} className="text-center text-white/50 text-[10px] font-semibold pb-2">
            {d.weekday}
          </span>
        ))}
        {rows.map(([name, cell]) => (
          <div key={name} className="contents">
            <span className="text-white/60 text-[11px] py-2 border-t border-white/[0.06]">{name}</span>
            {week.days.map((d) => (
              <span key={d.dateKey} className="flex justify-center items-center py-2 border-t border-white/[0.06]">
                {cell(d)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function LiftRow({ icon: Icon, accent, name, sub, value, change, first }) {
  return (
    <div className={`flex items-center gap-3 py-2.5 ${first ? "" : "border-t border-white/[0.06]"}`}>
      <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: accent ? "rgba(47,143,255,0.14)" : "rgba(255,255,255,0.07)" }}>
        <Icon size={13} color={accent ? MEASURE_BLUE : "rgba(255,255,255,0.7)"} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-white text-[13px] font-medium truncate">{name}</p>
        <p className="text-white/45 text-[11px] tabular-nums truncate">{sub}</p>
      </div>
      <span className="text-white text-[15px] font-semibold tabular-nums">{dash(value)}</span>
      <span className="text-[12px] font-bold tabular-nums w-9 text-right" style={{ color: accent ? MEASURE_BLUE : "rgba(255,255,255,0.5)" }}>
        {change}
      </span>
    </div>
  );
}

export function LiftLists({ week }) {
  return (
    <GlassCard>
      <CardLabel right="est. max · change on last session">Best lifts</CardLabel>
      {week.bestLifts.length === 0 && <p className="text-white/45 text-sm py-2">No weighted sets this week.</p>}
      {week.bestLifts.map((l, i) => (
        <LiftRow
          key={l.id}
          first={i === 0}
          icon={l.pr ? Trophy : TrendingUp}
          accent
          name={l.name}
          sub={
            <>
              {l.set.weight} kg × {l.set.reps}
              {l.pr && <span className="ml-1.5 font-bold" style={{ color: MEASURE_BLUE }}>PR</span>}
            </>
          }
          value={l.e1rm}
          change={signed(l.change) ?? "new"}
        />
      ))}
      <div className="mt-4" />
      <CardLabel right="no progress in 3 weeks">Stagnant lifts</CardLabel>
      {week.stagnant.length === 0 && <p className="text-white/45 text-sm py-2">Nothing stuck.</p>}
      {week.stagnant.map((l, i) => (
        <LiftRow
          key={l.id}
          first={i === 0}
          icon={MoveRight}
          name={l.name}
          sub={`${l.set ? `${l.set.weight} kg × ${l.set.reps} · ` : ""}${l.sessions} sessions`}
          value={l.e1rm}
          change="±0"
        />
      ))}
    </GlassCard>
  );
}

// Four tiles for Write / Publish.
export function WeekStrip({ week, nutritionScore }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }} data-testid="week-strip">
      {weekRingsData(week, nutritionScore).map((r) => (
        <div key={r.label} className="rounded-2xl p-3 min-w-0" style={CARD_GLASS}>
          <p className="text-white/50 text-[10px] font-bold uppercase tracking-wider">{r.label}</p>
          <p className="text-white text-[22px] font-semibold tabular-nums leading-tight mt-1">{r.pct === null ? "–" : `${r.pct}%`}</p>
          <p className="text-white/45 text-[10px] truncate">{r.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ---- the linked check-in ----
const VERDICT_COLOR = { better: MEASURE_BLUE, worse: "#FFFFFF", same: "rgba(255,255,255,0.4)", new: "rgba(255,255,255,0.4)" };
const VERDICT_TEXT = { better: "Better", worse: "Worse", same: "Same", new: "New" };

function Scale5({ v }) {
  return (
    <span className="flex gap-1" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="w-2.5 h-2.5 rounded-full" style={{ background: i <= v ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.12)" }} />
      ))}
    </span>
  );
}

const fmtDay = (ts) => new Date(ts).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

export function CheckinSummary({ response, formName, changes, linked = true, compact = false }) {
  if (!response) {
    return (
      <GlassCard>
        <CardLabel>Weekly check-in</CardLabel>
        <p className="text-white/55 text-sm">This video isn't linked to a check-in. Open it from a check-in response to link one.</p>
      </GlassCard>
    );
  }
  return (
    <div className="space-y-2.5" data-testid="linked-checkin">
      <GlassCard padding={compact ? 14 : 20}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-white/55">{formName || "Weekly check-in"}</p>
            <p className="text-white text-[18px] font-semibold mt-1">Submitted {fmtDay(response.date)}</p>
            <p className="text-white/50 text-[12px]">{changes.previous ? `Compared with ${fmtDay(changes.previous.date)}` : "First check-in of this form — nothing to compare yet"}</p>
          </div>
          {linked && (
            <span className="shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-full text-white text-[11px] font-bold" style={BLUE_GLASS}>
              <Check size={13} /> LINKED TO THIS VIDEO
            </span>
          )}
        </div>
        {changes.keyChanges.length > 0 && (
          <div className="mt-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", padding: 14 }} data-testid="key-changes">
            <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-white/60 mb-2">Key changes · talk about these</p>
            {changes.keyChanges.map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-1.5 flex-wrap">
                <span className="text-white text-[28px] font-semibold tabular-nums leading-none">
                  {c.prev}
                  <span className="text-white/40 mx-1.5 text-[18px]">→</span>
                  {c.now}
                </span>
                <span className="text-white text-[14px] font-semibold flex-1 min-w-0">
                  {c.label} {c.delta > 0 ? "up" : "down"}
                </span>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full border border-white/40 text-white">NEEDS ATTENTION</span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
      {changes.ratings.length > 0 && (
        <GlassCard padding={compact ? 14 : 20}>
          <CardLabel right="1–5 · last check-in → this one">Ratings</CardLabel>
          {changes.ratings.map((r, i) => (
            <div key={r.id} className={`grid items-center gap-3 py-2.5 ${i ? "border-t border-white/[0.06]" : ""}`} style={{ gridTemplateColumns: compact ? "minmax(0,1fr) auto auto" : "minmax(0,1fr) auto auto auto" }}>
              <span className="text-white text-[13px] font-medium truncate">{r.label}</span>
              {!compact && <Scale5 v={r.now} />}
              <span className="text-white text-[16px] font-semibold tabular-nums text-right">
                {r.prev !== null && <span className="text-white/40 text-[13px]">{r.prev} → </span>}
                {r.now}
              </span>
              <span className="text-[11px] font-bold w-14 text-right" style={{ color: VERDICT_COLOR[r.verdict] }}>
                {VERDICT_TEXT[r.verdict]}
              </span>
            </div>
          ))}
        </GlassCard>
      )}
      {changes.answers.length > 0 && (
        <GlassCard padding={compact ? 14 : 20}>
          <CardLabel>Their answers</CardLabel>
          {changes.answers.map((a, i) => (
            <div key={a.id} className={`py-3 ${i ? "border-t border-white/[0.06]" : ""}`}>
              <p className="text-white/50 text-[11px]">{a.label}</p>
              {a.type === "photo" ? (
                <img src={a.value} alt="" className="mt-1.5 rounded-lg max-h-48 object-cover" />
              ) : (
                <p className="text-white text-[14px] leading-snug mt-1 whitespace-pre-line">
                  {String(a.value)}
                  {a.prev !== null && a.prev !== undefined && <span className="text-white/45 text-[12px] ml-2">last time {a.prev}</span>}
                </p>
              )}
            </div>
          ))}
        </GlassCard>
      )}
    </div>
  );
}
