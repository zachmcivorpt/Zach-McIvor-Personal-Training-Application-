// Coach video feedback (#219): the client's information beside the camera.
// Switching sections only changes this panel's own state, so a recording in
// progress (held by the workspace above it) is never touched. Read-only:
// every figure is the client's own data (clientSnapshot.js).
import { useMemo, useState } from "react";
import {
  LayoutGrid,
  Scale,
  Utensils,
  Dumbbell,
  TrendingUp,
  ClipboardList,
  Image as ImageIcon,
  NotebookPen,
  ChevronDown,
  Check,
  ChevronLeft,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { useApp } from "../../lib/AppContext";
import { MEASURE_BLUE } from "../../theme";
import { resolveNutritionTargets } from "../../lib/nutritionTargets";
import { BODY_FAT_CONFIG, BODY_MEASUREMENTS_CONFIG, LEAN_MASS_CONFIG } from "../../components/ProgressWidgets";
import { localDateKey } from "../../lib/dateKey";
import { liftProgress, measurementChanges, nutritionWeek, trainingWeek, weightSummary } from "./clientSnapshot";
import { formatClock } from "../../lib/videoFeedback/timeline";

export const INFO_SECTIONS = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "weight", label: "Weight", icon: Scale },
  { id: "nutrition", label: "Nutrition", icon: Utensils },
  { id: "training", label: "Training", icon: Dumbbell },
  { id: "lifts", label: "Lifts", icon: TrendingUp },
  { id: "checkins", label: "Check-ins", icon: ClipboardList },
  { id: "photos", label: "Photos", icon: ImageIcon },
  { id: "notes", label: "Notes", icon: NotebookPen },
];

const RULE = "border-white/[0.08]";
const fmtDay = (ts) => new Date(ts).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const fmtShort = (ts) => new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const signed = (n, unit = "") => (n === null || n === undefined ? "–" : `${n > 0 ? "+" : ""}${n}${unit}`);

function Label({ children, className = "" }) {
  return <p className={`text-[10px] font-bold tracking-[0.14em] uppercase text-white/45 ${className}`}>{children}</p>;
}

function Figure({ value, unit, label, accent }) {
  return (
    <div className="min-w-0">
      <p className="text-white text-[26px] leading-none font-semibold tabular-nums truncate" style={accent ? { color: MEASURE_BLUE } : undefined}>
        {value}
        {unit && <span className="text-white/45 text-sm font-medium ml-1">{unit}</span>}
      </p>
      <p className="text-white/50 text-[11px] mt-1.5">{label}</p>
    </div>
  );
}

function Section({ title, children, first = false }) {
  return (
    <section className={`py-4 ${first ? "" : `border-t ${RULE}`}`}>
      {title && <Label className="mb-3">{title}</Label>}
      {children}
    </section>
  );
}

function Empty({ children }) {
  return <p className="text-white/45 text-sm py-6">{children}</p>;
}

// Small weight line, drawn inline (no chart library on this path).
function WeightChart({ series }) {
  const pts = series.slice(-60);
  if (pts.length < 2) return null;
  const W = 320;
  const H = 110;
  const min = Math.min(...pts.map((p) => p.weight));
  const max = Math.max(...pts.map((p) => p.weight));
  const span = Math.max(0.5, max - min);
  const t0 = pts[0].date;
  const t1 = pts[pts.length - 1].date;
  const x = (d) => ((d - t0) / Math.max(1, t1 - t0)) * (W - 8) + 4;
  const y = (w) => H - 10 - ((w - min) / span) * (H - 24);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.weight).toFixed(1)}`).join(" ");
  const area = `${line} L${x(t1).toFixed(1)},${H} L${x(t0).toFixed(1)},${H} Z`;
  const last = pts[pts.length - 1];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[110px]" preserveAspectRatio="none" aria-label="Weight trend">
        <defs>
          <linearGradient id="vfWeightFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={MEASURE_BLUE} stopOpacity="0.28" />
            <stop offset="100%" stopColor={MEASURE_BLUE} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#vfWeightFill)" />
        <path d={line} fill="none" stroke={MEASURE_BLUE} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <circle cx={x(last.date)} cy={y(last.weight)} r="3.5" fill={MEASURE_BLUE} />
      </svg>
      <div className="flex justify-between text-white/40 text-[10px] mt-1 tabular-nums">
        <span>{fmtShort(t0)}</span>
        <span>
          {min.toFixed(1)}–{max.toFixed(1)} kg
        </span>
        <span>{fmtShort(t1)}</span>
      </div>
    </div>
  );
}

function OverviewSection({ client, data, checkInDate }) {
  const { weight, nutrition, training, targets } = data;
  return (
    <>
      <Section first>
        <p className="text-white text-lg font-semibold">{client.name}</p>
        {client.preferences?.goals && <p className="text-white/60 text-sm mt-1 leading-snug">{client.preferences.goals}</p>}
        {checkInDate && <p className="text-white/45 text-xs mt-2">Answering the check-in from {fmtDay(checkInDate)}</p>}
      </Section>
      <Section title="This week">
        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Figure value={weight.latest ? weight.latest.weight.toFixed(1) : "–"} unit="kg" label={`Weight · ${signed(weight.change7, " kg")} in 7 days`} />
          <Figure value={`${training.plannedDone}/${training.planned.length}`} label="Planned sessions done" accent />
          <Figure value={`${nutrition.loggedCount}/7`} label="Days with food logged" />
          <Figure value={nutrition.avgCalories ?? "–"} unit="kcal" label={`Average · target ${targets.calories}`} />
          <Figure value={nutrition.avgProtein ?? "–"} unit="g" label={`Protein · target ${targets.protein} g`} />
          <Figure value={training.completed7} label="Sessions in the last 7 days" />
        </div>
      </Section>
    </>
  );
}

function WeightSection({ data }) {
  const { weight, measurements } = data;
  if (!weight.latest && measurements.length === 0) return <Empty>No weigh-ins or measurements yet.</Empty>;
  return (
    <>
      {weight.latest && (
        <Section first>
          <div className="flex items-end justify-between gap-3">
            <Figure value={weight.latest.weight.toFixed(1)} unit="kg" label={`Latest · ${fmtShort(weight.latest.date)}`} />
            <div className="flex gap-4 text-right">
              <div>
                <p className="text-white text-sm font-semibold tabular-nums">{signed(weight.change7)}</p>
                <p className="text-white/45 text-[10px]">7 days</p>
              </div>
              <div>
                <p className="text-white text-sm font-semibold tabular-nums">{signed(weight.change28)}</p>
                <p className="text-white/45 text-[10px]">4 weeks</p>
              </div>
              <div>
                <p className="text-white text-sm font-semibold tabular-nums">{signed(weight.changeAll)}</p>
                <p className="text-white/45 text-[10px]">Since start</p>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <WeightChart series={weight.series} />
          </div>
          {weight.avg7 !== null && <p className="text-white/50 text-xs mt-3">7-day average {weight.avg7} kg</p>}
        </Section>
      )}
      {weight.series.length > 0 && (
        <Section title="Recent weigh-ins">
          <div className="divide-y divide-white/[0.06]">
            {weight.series
              .slice(-8)
              .reverse()
              .map((p) => (
                <div key={p.date} className="flex justify-between py-2 text-sm">
                  <span className="text-white/60">{fmtDay(p.date)}</span>
                  <span className="text-white font-medium tabular-nums">{p.weight.toFixed(1)} kg</span>
                </div>
              ))}
          </div>
        </Section>
      )}
      {measurements.length > 0 && (
        <Section title="Measurements · first → latest">
          <div className="divide-y divide-white/[0.06]">
            {measurements.map((m) => (
              <div key={m.key} className="flex items-center justify-between py-2 text-sm gap-3">
                <span className="text-white/60 truncate">{m.label}</span>
                <span className="text-white tabular-nums shrink-0">
                  {m.first.value}
                  {m.unit === "%" ? "%" : ""} → <span className="font-semibold">{m.latest.value}</span> {m.unit !== "%" && m.unit}
                  <span className="text-white/45 ml-2">{signed(m.change)}</span>
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

function NutritionSection({ data }) {
  const { nutrition, targets } = data;
  return (
    <>
      <Section first title="Targets">
        <div className="grid grid-cols-4 gap-3">
          <Figure value={targets.calories} label="kcal" />
          <Figure value={targets.protein} label="Protein g" />
          <Figure value={targets.carbs} label="Carbs g" />
          <Figure value={targets.fat} label="Fat g" />
        </div>
      </Section>
      <Section title="Last 7 completed days">
        {nutrition.loggedCount === 0 ? (
          <Empty>No food logged in the last 7 days.</Empty>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Figure value={`${nutrition.loggedCount}/7`} label="Days logged" />
              <Figure value={`${nutrition.calorieHits}/7`} label="On calorie target" accent />
              <Figure value={`${nutrition.proteinHits}/7`} label="Protein hit" accent />
            </div>
            <div className="grid grid-cols-4 gap-3 mb-4">
              <Figure value={nutrition.avgCalories} label="Avg kcal" />
              <Figure value={nutrition.avgProtein} label="Avg P" />
              <Figure value={nutrition.avgCarbs} label="Avg C" />
              <Figure value={nutrition.avgFat} label="Avg F" />
            </div>
            <div className="divide-y divide-white/[0.06]">
              {nutrition.days.map((d) => (
                <div key={d.dateKey} className="flex items-center py-2 text-sm gap-3">
                  <span className="text-white/60 w-10 shrink-0">{d.weekday}</span>
                  {d.logged ? (
                    <>
                      <span className="flex-1 text-white tabular-nums">
                        {d.calories} <span className="text-white/40">kcal</span>
                      </span>
                      <span className="text-white/70 tabular-nums">P {d.protein}</span>
                      <span className="flex gap-1 shrink-0" aria-label="targets hit">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.calorieHit ? MEASURE_BLUE : "rgba(255,255,255,0.15)" }} />
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.proteinHit ? MEASURE_BLUE : "rgba(255,255,255,0.15)" }} />
                      </span>
                    </>
                  ) : (
                    <span className="flex-1 text-white/35">Not logged</span>
                  )}
                </div>
              ))}
            </div>
            <p className="text-white/35 text-[10px] mt-2">Dots: calories within 12% · protein at 90%+</p>
          </>
        )}
      </Section>
    </>
  );
}

function SessionRow({ s, exercisesById }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border-t ${RULE} first:border-t-0`}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 py-2.5 text-left">
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{s.label}</p>
          <p className="text-white/45 text-[11px]">
            {fmtDay(s.date)}
            {s.sets > 0 && ` · ${s.sets} sets`}
            {s.volume > 0 && ` · ${s.volume.toLocaleString()} kg`}
            {s.cardio?.durationMin && ` · ${s.cardio.durationMin} min`}
          </p>
        </div>
        {s.entries.length > 0 && <ChevronDown size={15} className={`text-white/50 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && (
        <div className="pb-3 space-y-2">
          {s.entries.map((e, i) => (
            <div key={i} className="text-xs">
              <p className="text-white/80 font-medium">{exercisesById[e.exerciseId]?.name || e.name || "Exercise"}</p>
              <p className="text-white/50 tabular-nums mt-0.5">{(e.sets || []).map((set) => `${set.weight || 0}×${set.reps || 0}`).join("  ·  ") || "–"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrainingSection({ data, exercisesById }) {
  const { training, phase } = data;
  return (
    <>
      <Section first title={phase ? "Current phase" : undefined}>
        {phase && <p className="text-white font-semibold mb-3">{phase.name}</p>}
        <div className="grid grid-cols-3 gap-3">
          <Figure value={`${training.plannedDone}/${training.planned.length}`} label="Planned this week" accent />
          <Figure value={training.completed7} label="Last 7 days" />
          <Figure value={training.volume7 ? training.volume7.toLocaleString() : "–"} label="Kg lifted · 7 days" />
        </div>
      </Section>
      {training.planned.length > 0 && (
        <Section title="This week">
          <div className="divide-y divide-white/[0.06]">
            {training.planned.map((p) => (
              <div key={p.dateKey} className="flex items-center gap-3 py-2 text-sm">
                <span className="text-white/55 w-24 shrink-0">{fmtDay(new Date(p.dateKey + "T12:00:00").getTime())}</span>
                <span className="flex-1 text-white truncate">{p.label}</span>
                {p.done ? <Check size={15} style={{ color: MEASURE_BLUE }} /> : <span className="text-white/35 text-xs">Not done</span>}
              </div>
            ))}
          </div>
        </Section>
      )}
      <Section title="Completed sessions">
        {training.recent.length === 0 ? (
          <Empty>No sessions logged yet.</Empty>
        ) : (
          training.recent.map((s) => <SessionRow key={s.id || s.date} s={s} exercisesById={exercisesById} />)
        )}
      </Section>
    </>
  );
}

function LiftsSection({ data }) {
  const [openId, setOpenId] = useState(null);
  if (data.lifts.length === 0) return <Empty>No weighted sets logged in the last 8 weeks.</Empty>;
  return (
    <Section first title="Estimated max · first → latest (8 weeks)">
      {data.lifts.map((l) => (
        <div key={l.id} className={`border-t ${RULE} first:border-t-0`}>
          <button type="button" onClick={() => setOpenId(openId === l.id ? null : l.id)} className="w-full flex items-center gap-3 py-2.5 text-left">
            <span className="flex-1 min-w-0 text-white text-sm font-medium truncate">{l.name}</span>
            <span className="text-white/60 text-sm tabular-nums">
              {l.firstE1rm} → <span className="text-white font-semibold">{l.latestE1rm}</span>
            </span>
            <span className="text-xs font-semibold tabular-nums w-12 text-right" style={{ color: l.change > 0 ? MEASURE_BLUE : "rgba(255,255,255,0.5)" }}>
              {signed(l.change)}
            </span>
          </button>
          {openId === l.id && (
            <div className="pb-3 space-y-1.5">
              {l.sessions
                .slice()
                .reverse()
                .map((s) => (
                  <div key={s.date} className="flex gap-3 text-xs">
                    <span className="text-white/45 w-20 shrink-0">{fmtShort(s.date)}</span>
                    <span className="text-white/75 tabular-nums">{s.sets.map((x) => `${x.weight}×${x.reps}`).join("  ·  ")}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      ))}
    </Section>
  );
}

function CheckInsSection({ data, checkInId }) {
  const { responses, formsById, previousFeedback } = data;
  const [openId, setOpenId] = useState(checkInId || responses[0]?.id || null);
  return (
    <>
      <Section first title="Check-in responses">
        {responses.length === 0 && <Empty>No check-ins submitted yet.</Empty>}
        {responses.slice(0, 8).map((r) => {
          const form = formsById[r.formId];
          const open = openId === r.id;
          return (
            <div key={r.id} className={`border-t ${RULE} first:border-t-0`}>
              <button type="button" onClick={() => setOpenId(open ? null : r.id)} className="w-full flex items-center gap-3 py-2.5 text-left">
                <span className="flex-1 min-w-0">
                  <span className="block text-white text-sm font-medium truncate">{form?.name || "Check-in"}</span>
                  <span className="block text-white/45 text-[11px]">
                    {fmtDay(r.date)}
                    {r.id === checkInId && " · this check-in"}
                  </span>
                </span>
                <ChevronDown size={15} className={`text-white/50 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              {open && (
                <div className="pb-3 space-y-3">
                  {(form?.questions || []).map((q) => (
                    <div key={q.id}>
                      <p className="text-white/45 text-[11px]">{q.label || "Question"}</p>
                      {q.type === "photo" && r.answers?.[q.id] ? (
                        <img src={r.answers[q.id]} alt="" className="mt-1 rounded-lg max-h-40 object-cover" />
                      ) : (
                        <p className="text-white text-sm mt-0.5 whitespace-pre-line">
                          {q.type === "rating" && r.answers?.[q.id] ? `${r.answers[q.id]} / 5` : r.answers?.[q.id] || "–"}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </Section>
      {previousFeedback.length > 0 && (
        <Section title="Your previous feedback">
          {previousFeedback.slice(0, 4).map((f) => (
            <div key={f.id} className={`py-2.5 border-t ${RULE} first:border-t-0`}>
              <p className="text-white/45 text-[11px]">
                {fmtDay(f.publishedAt)} · {formatClock(f.duration)}
              </p>
              {(f.summary?.priorities || []).length > 0 ? (
                <ol className="mt-1 space-y-0.5">
                  {f.summary.priorities.map((p, i) => (
                    <li key={i} className="text-white/80 text-sm">
                      <span className="tabular-nums mr-2" style={{ color: MEASURE_BLUE }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {p}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-white/80 text-sm mt-1 line-clamp-3">{f.summary?.overall}</p>
              )}
            </div>
          ))}
        </Section>
      )}
    </>
  );
}

function PhotosSection({ data }) {
  const [index, setIndex] = useState(null);
  const photos = data.photos;
  if (photos.length === 0) return <Empty>No progress photos yet.</Empty>;
  if (index !== null) {
    const p = photos[index];
    return (
      <Section first>
        <div className="flex items-center justify-between mb-2">
          <button type="button" onClick={() => setIndex(null)} className="text-white/70 text-xs font-semibold">
            All photos
          </button>
          <span className="text-white/50 text-xs">{fmtDay(p.date)}</span>
        </div>
        <img src={p.url} alt="" className="w-full max-h-[55vh] object-contain rounded-xl bg-black" />
        <div className="flex justify-between mt-2">
          <button type="button" disabled={index >= photos.length - 1} onClick={() => setIndex(index + 1)} className="text-white disabled:opacity-30 p-2" aria-label="Older photo">
            <ChevronLeft size={18} />
          </button>
          <button type="button" disabled={index <= 0} onClick={() => setIndex(index - 1)} className="text-white disabled:opacity-30 p-2" aria-label="Newer photo">
            <ChevronRight size={18} />
          </button>
        </div>
      </Section>
    );
  }
  return (
    <Section first>
      <div className="grid grid-cols-3 gap-1.5">
        {photos.slice(0, 24).map((p, i) => (
          <button key={p.id || i} type="button" onClick={() => setIndex(i)} className="relative aspect-[3/4] overflow-hidden rounded-lg bg-white/5">
            <img src={p.url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
            <span className="absolute left-1 bottom-1 text-[9px] text-white font-semibold px-1.5 py-0.5 rounded bg-black/50">{fmtShort(p.date)}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

function NotesSection({ data }) {
  if (data.notes.length === 0) return <Empty>No coaching notes for this client yet.</Empty>;
  return (
    <Section first>
      {data.notes.slice(0, 20).map((n) => (
        <div key={n.id} className={`py-2.5 border-t ${RULE} first:border-t-0`}>
          <p className="text-white/45 text-[11px]">{fmtDay(n.date)}</p>
          <p className="text-white text-sm mt-0.5 whitespace-pre-line">{n.text}</p>
        </div>
      ))}
    </Section>
  );
}

export function useClientSnapshot(client, now) {
  const { db } = useApp();
  const id = client.id;
  const exercisesById = useMemo(() => Object.fromEntries((db.exercises || []).map((e) => [e.id, e])), [db.exercises]);
  const data = useMemo(() => {
    const targets = resolveNutritionTargets(client.nutritionTargets);
    const todayKey = localDateKey(new Date(now));
    const phases = db.clientPhases?.[id] || [];
    return {
      targets,
      weight: weightSummary(db.weighIns?.[id], now),
      measurements: measurementChanges(db.bodyMetrics?.[id], [BODY_FAT_CONFIG, LEAN_MASS_CONFIG, ...BODY_MEASUREMENTS_CONFIG]),
      nutrition: nutritionWeek(db.nutritionLogs?.[id], targets, now),
      training: trainingWeek(db.workoutLogs?.[id], db.scheduledWorkouts?.[id], now),
      lifts: liftProgress(db.workoutLogs?.[id], exercisesById, now),
      phase: phases.find((p) => p.startDate <= todayKey && (p.endDate || "9999-12-31") >= todayKey) || null,
      responses: db.formResponses?.[id] || [],
      formsById: Object.fromEntries((db.forms || []).map((f) => [f.id, f])),
      previousFeedback: db.videoFeedback?.[id] || [],
      photos: db.progressPhotos?.[id] || [],
      notes: db.clientNotes?.[id] || [],
    };
  }, [db, id, client.nutritionTargets, exercisesById, now]);
  return { data, exercisesById };
}

// collapsed: the panel shrinks to a strip of section icons; tapping one
// opens it again on that section.
export default function ClientInfoPanel({ client, checkInId, checkInDate, section, onSection, collapsed, onToggleCollapsed, layout = "side" }) {
  const [now] = useState(() => Date.now());
  const { data, exercisesById } = useClientSnapshot(client, now);

  if (collapsed) {
    return (
      <div className={`h-full flex ${layout === "side" ? "flex-col py-2" : "flex-row px-2"} items-center gap-1 overflow-auto`} data-testid="client-info-panel" data-collapsed="true">
        <button type="button" onClick={onToggleCollapsed} className="w-10 h-10 shrink-0 flex items-center justify-center text-white/70" aria-label="Show client information">
          <PanelRightOpen size={17} />
        </button>
        {INFO_SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-label={s.label}
            onClick={() => {
              onSection(s.id);
              onToggleCollapsed();
            }}
            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl"
            style={{ color: section === s.id ? MEASURE_BLUE : "rgba(255,255,255,0.6)" }}
          >
            <s.icon size={17} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0" data-testid="client-info-panel" data-collapsed="false">
      <div className={`flex items-center gap-1 px-2 py-2 border-b ${RULE} shrink-0`}>
        <div
          className="flex-1 flex gap-1 overflow-x-auto no-scrollbar"
          role="tablist"
          aria-label="Client information"
          style={{ maskImage: "linear-gradient(90deg, #000 88%, transparent)", WebkitMaskImage: "linear-gradient(90deg, #000 88%, transparent)" }}
        >
          {INFO_SECTIONS.map((s) => {
            const active = section === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSection(s.id)}
                className={`shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold transition-colors ${active ? "bg-white text-black" : "text-white/70 hover:text-white"}`}
              >
                <s.icon size={13} />
                {s.label}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={onToggleCollapsed} className="w-9 h-9 shrink-0 flex items-center justify-center text-white/60" aria-label="Hide client information">
          <PanelRightClose size={17} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-6" data-testid={`info-section-${section}`}>
        {section === "overview" && <OverviewSection client={client} data={data} checkInDate={checkInDate} />}
        {section === "weight" && <WeightSection data={data} />}
        {section === "nutrition" && <NutritionSection data={data} />}
        {section === "training" && <TrainingSection data={data} exercisesById={exercisesById} />}
        {section === "lifts" && <LiftsSection data={data} />}
        {section === "checkins" && <CheckInsSection data={data} checkInId={checkInId} />}
        {section === "photos" && <PhotosSection data={data} />}
        {section === "notes" && <NotesSection data={data} />}
      </div>
    </div>
  );
}
