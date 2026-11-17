// Coach Overview → Training and Nutrition command centre (#261, owner).
//
// Two matching dark-glass panels on Overview: the same header, the same
// four figures (each one a filter), the same filter chips + sort, the same
// client rows (two measured figures with a thin bar each, one line of
// detail, and three actions) and the same message sheet. Every figure comes
// from commandCentre.js (the client's own logs, targets and schedule);
// every button does what it says: Message opens suggestions written from
// those figures and sends through the normal chat (sendMessage), Diary /
// History / the row open the client's page on the right tab.
import React, { useMemo, useState } from "react";
import { useApp } from "../lib/AppContext";
import { Avatar, BottomSheet } from "../components/ui";
import { MEASURE_BLUE, GOAL_GREEN, OVER_RED } from "../theme";
import { GLASS, GLASS_BLUE, GlassButton, SHEET_GLASS } from "./darkUI";
import {
  nutritionDay,
  nutritionTrend,
  nutritionNeedsAttention,
  nutritionSuggestions,
  trainingSummary,
  trainingNeedsAttention,
  trainingSuggestions,
  sortRows,
  addDaysKey,
  NUTRITION_STATUS,
  TRAINING_STATUS,
} from "./commandCentre";
import { Utensils, Dumbbell, MessageSquare, ChevronRight, Sparkles, Send, ExternalLink, BookOpen, History } from "lucide-react";

const PREVIEW_ROWS = 6;
const TONE = { green: GOAL_GREEN, red: OVER_RED, blue: MEASURE_BLUE, muted: "rgba(255,255,255,0.45)" };
const PANEL = {
  ...GLASS,
  background: "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025))",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 18px 40px -24px rgba(0,0,0,0.9)",
};

const fmt = (n) => Math.round(n).toLocaleString();
function shortDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
}
function clockTime(ms) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function daysAgoLabel(n) {
  if (n === null || n === undefined) return "";
  return n === 0 ? "today" : n === 1 ? "yesterday" : `${n}d ago`;
}

// ---- shared building blocks (identical in both panels) ---------------------
function StatusPill({ status, table }) {
  const s = table[status];
  const color = TONE[s.tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 shrink-0 rounded-full px-2 py-[3px] text-[10.5px] font-semibold tracking-[0.02em] whitespace-nowrap"
      style={{ color: s.tone === "muted" ? "rgba(255,255,255,0.7)" : color, backgroundColor: s.tone === "muted" ? "rgba(255,255,255,0.06)" : `${color}1A`, border: `1px solid ${s.tone === "muted" ? "rgba(255,255,255,0.12)" : `${color}55`}` }}
      data-testid="cc-status"
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {s.label}
    </span>
  );
}

function Stat({ value, label, tone, active, onClick, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className="flex flex-col items-start text-left rounded-xl px-3 py-2.5 min-w-0 transition-colors active:scale-[0.98]"
      style={active ? GLASS_BLUE : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <span className="text-white text-[22px] sm:text-[26px] font-semibold tracking-[-0.03em] leading-none tabular-nums" style={tone ? { color: TONE[tone] } : undefined}>
        {value}
      </span>
      <span className="text-white/55 text-[10.5px] sm:text-[11px] leading-tight mt-1.5">{label}</span>
    </button>
  );
}

// One measured figure: label, "actual / target", the exact difference, and
// a thin bar (blue under, green hit, red over — muted with no target).
function Measure({ label, actual, target, unit, diffText, tone, pct }) {
  return (
    <div className="min-w-0">
      <p className="text-white/45 text-[10px] font-semibold tracking-[0.08em] uppercase">{label}</p>
      <p className="text-white text-[13px] mt-0.5 tabular-nums truncate">
        <span className="font-semibold">{actual}</span>
        {target != null && <span className="text-white/45"> / {target}{unit}</span>}
        {target == null && unit && <span className="text-white/45">{unit}</span>}
      </p>
      <div className="h-[3px] rounded-full mt-1.5 overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, pct || 0))}%`, backgroundColor: TONE[tone] }} />
      </div>
      <p className="text-[11px] mt-1 truncate" style={{ color: tone === "muted" ? "rgba(255,255,255,0.45)" : TONE[tone] }}>
        {diffText}
      </p>
    </div>
  );
}

function RowAction({ icon: Icon, label, onClick, testId }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      data-testid={testId}
      className="h-8 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-white/80 text-[11px] font-semibold hover:text-white active:scale-[0.96] transition"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}
    >
      <Icon size={13} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function ClientRow({ row, table, measures, detail, actions, onOpen, testId }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      data-testid={testId}
      className="px-3.5 sm:px-4 py-3 border-t cursor-pointer hover:bg-white/[0.025] active:bg-white/[0.04] transition-colors"
      style={{ borderColor: "rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Avatar name={row.client.name} url={row.client.avatarUrl} size={30} dark />
        <p className="flex-1 min-w-0 text-white text-[13.5px] font-semibold truncate">{row.client.name}</p>
        <StatusPill status={row.status} table={table} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 mt-2.5 sm:pl-[40px]">
        {measures.map((m) => (
          <Measure key={m.label} {...m} />
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2.5 sm:pl-[40px]">
        <p className="flex-1 min-w-0 text-white/55 text-[11.5px] leading-snug">{detail}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          {actions.map((a) => (
            <RowAction key={a.label} {...a} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Chip({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="h-7 px-2.5 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors"
      style={active ? { backgroundColor: "#fff", color: "#000" } : { color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}
    >
      {label}
      <span className={`ml-1 tabular-nums ${active ? "text-black/50" : "text-white/40"}`}>{count}</span>
    </button>
  );
}

// The panel frame both sections share: header, four figures, filters +
// sort, rows, "Show all".
function OverviewPanel({ id, icon: Icon, title, subtitle, headerRight, stats, filters, filter, setFilter, sort, setSort, sortOptions, rows, renderRow, ready, emptyText }) {
  const [showAll, setShowAll] = useState(false);
  const active = filters.find((f) => f.id === filter) || filters[0];
  const visible = rows.filter(active.test);
  const shown = showAll ? visible : visible.slice(0, PREVIEW_ROWS);
  return (
    <section className="relative rounded-2xl overflow-hidden min-w-0" style={PANEL} data-testid={`cc-${id}`} aria-label={`${title} overview`}>
      <div className="px-3.5 sm:px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={GLASS_BLUE}>
            <Icon size={15} className="text-white" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-white text-[16px] font-semibold tracking-[-0.01em] leading-tight">{title}</h2>
            <p className="text-white/50 text-[11.5px] truncate">{subtitle}</p>
          </div>
          {headerRight}
        </div>
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2 mt-3.5">
          {stats.map((s) => (
            <Stat key={s.filter} {...s} value={ready ? s.value : "–"} active={filter === s.filter} onClick={() => setFilter(filter === s.filter ? "all" : s.filter)} testId={`cc-${id}-stat-${s.filter}`} />
          ))}
        </div>
        <div className="flex items-start gap-2 mt-3">
          {/* Status chips; the figures above are filters themselves, so
              their chips only show while one is selected. One scrolling
              line on phones, wrapping from sm. */}
          <div className="flex sm:flex-wrap gap-1.5 flex-1 min-w-0 overflow-x-auto sm:overflow-visible no-scrollbar">
            {filters
              .filter((f) => f.id === "all" || f.id === filter || (!stats.some((st) => st.filter === f.id && f.id !== "attention") && rows.some(f.test)))
              .map((f) => (
                <Chip key={f.id} label={f.label} count={rows.filter(f.test).length} active={filter === f.id} onClick={() => setFilter(f.id)} />
              ))}
          </div>
          <label className="shrink-0">
            <span className="sr-only">Sort {title}</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              data-testid={`cc-${id}-sort`}
              className="h-7 rounded-full pl-2.5 pr-1.5 text-[11px] font-semibold text-white outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", colorScheme: "dark" }}
            >
              {sortOptions.map((o) => (
                <option key={o.id} value={o.id} style={{ backgroundColor: "#111" }}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div data-testid={`cc-${id}-list`}>
        {!ready ? (
          <p className="text-white/45 text-[12.5px] text-center py-8 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            Loading…
          </p>
        ) : shown.length === 0 ? (
          <p className="text-white/55 text-[12.5px] text-center py-8 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            {rows.length === 0 ? "No active clients yet." : emptyText}
          </p>
        ) : (
          shown.map(renderRow)
        )}
        {ready && visible.length > PREVIEW_ROWS && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full py-3 text-[12.5px] font-semibold border-t" style={{ color: MEASURE_BLUE, borderColor: "rgba(255,255,255,0.07)" }} data-testid={`cc-${id}-more`}>
            {showAll ? "Show fewer" : `Show all ${visible.length}`}
          </button>
        )}
      </div>
    </section>
  );
}

// ---- Message sheet: suggestions from real figures, editable, then sent
// through the normal chat (sendMessage) ------------------------------------
function MessageSheet({ target, onClose, onOpenChat }) {
  const { sendMessage } = useApp();
  const [text, setText] = useState("");
  const [picked, setPicked] = useState(null);
  const open = !!target;
  const first = target?.client?.name?.split(" ")[0] || "client";

  function choose(s, i) {
    setPicked(i);
    setText(s);
  }
  function send() {
    const body = text.trim();
    if (!body || !target) return;
    sendMessage(target.client.id, "coach", body);
    target.onSent?.(`Message sent to ${first}`);
    setText("");
    setPicked(null);
    onClose();
  }
  function close() {
    setText("");
    setPicked(null);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={close} title={`Message ${first}`} dark surface={SHEET_GLASS} backdropClassName="bg-black/40">
      {target && (
        <div style={{ color: "#fff" }} data-testid="cc-message-sheet">
          <p className="flex items-center gap-1.5 text-white/55 text-[11px] font-semibold tracking-[0.08em] uppercase mb-2">
            <Sparkles size={11} style={{ color: MEASURE_BLUE }} /> Suggested from {first}'s {target.kind === "nutrition" ? "nutrition" : "training"}
          </p>
          <div className="space-y-1.5 mb-4">
            {target.suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => choose(s, i)}
                data-testid="cc-suggestion"
                className="w-full text-left rounded-xl px-3 py-2.5 text-[13px] leading-snug text-white/90 transition-colors"
                style={picked === i ? GLASS_BLUE : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}
              >
                {s}
              </button>
            ))}
          </div>
          <label className="block text-white/55 text-[11px] font-semibold tracking-[0.08em] uppercase mb-1.5" htmlFor="cc-message-text">
            Your message
          </label>
          <textarea
            id="cc-message-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Pick a suggestion above or write your own…"
            data-testid="cc-message-text"
            className="w-full rounded-xl px-3.5 py-3 text-[14px] leading-relaxed text-white outline-none placeholder:text-white/35 resize-none"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}
          />
          <div className="flex items-center gap-2 mt-3">
            <GlassButton onClick={() => onOpenChat(target.client.id)} className="flex-1">
              <ExternalLink size={13} /> Open chat
            </GlassButton>
            <GlassButton tone="blue" onClick={send} disabled={!text.trim()} className="flex-1" data-testid="cc-message-send">
              <Send size={13} /> Send
            </GlassButton>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

// ---- Nutrition -------------------------------------------------------------
const NUTRITION_FILTERS = [
  { id: "all", label: "All", test: () => true },
  { id: "attention", label: "Attention", test: nutritionNeedsAttention },
  { id: "completed", label: "Completed", test: (r) => r.status === "completed" },
  { id: "under", label: "Under", test: (r) => r.status === "under" || r.status === "inProgress" },
  { id: "over", label: "Over", test: (r) => r.status === "over" },
  { id: "notLogged", label: "No meals", test: (r) => r.status === "notLogged" },
  { id: "incomplete", label: "Incomplete", test: (r) => r.status === "incomplete" },
  { id: "noTarget", label: "No target", test: (r) => r.status === "noTarget" },
  { id: "logged", label: "Logged", test: (r) => r.logged },
  { id: "protein", label: "Protein hit", test: (r) => r.protein.state === "hit" || r.protein.state === "over" },
  { id: "calories", label: "Calories hit", test: (r) => r.calories.state === "hit" },
];
const NUTRITION_SORTS = [
  { id: "priority", label: "Priority" },
  { id: "protein", label: "Protein gap" },
  { id: "calories", label: "Calorie gap" },
  { id: "name", label: "Name" },
];

function measureFromCompare(cmp, label, unit, inProgress) {
  const u = unit === "kcal" ? " kcal" : unit;
  if (cmp.target == null) return { label, actual: unit === "kcal" ? fmt(cmp.actual) : `${cmp.actual}g`, target: null, unit: unit === "kcal" ? " kcal" : "", diffText: "No target assigned", tone: "muted", pct: 0 };
  const tone = cmp.state === "hit" ? "green" : cmp.state === "over" ? (unit === "g" ? "blue" : "red") : inProgress ? "blue" : "red";
  const abs = Math.abs(cmp.diff);
  const diffText =
    cmp.state === "hit"
      ? unit === "kcal"
        ? "Target reached"
        : "Goal completed"
      : cmp.state === "over"
        ? `${unit === "kcal" ? fmt(abs) : abs}${u} over`
        : `${unit === "kcal" ? fmt(abs) : abs}${u} ${inProgress ? "to go" : "under"}`;
  return {
    label,
    actual: unit === "kcal" ? fmt(cmp.actual) : `${cmp.actual}`,
    target: unit === "kcal" ? fmt(cmp.target) : cmp.target,
    unit: unit === "kcal" ? "" : "g",
    diffText,
    tone,
    pct: (cmp.actual / cmp.target) * 100,
  };
}

export function NutritionOverview({ clients, db, todayKey, ready, onOpenClient, onMessage }) {
  const [day, setDay] = useState("today");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("priority");
  const dateKey = day === "today" ? todayKey : addDaysKey(todayKey, -1);
  const final = day !== "today";
  const rows = useMemo(
    () => clients.map((c) => nutritionDay(c, db.nutritionLogs?.[c.id], dateKey, { final })),
    [clients, db.nutritionLogs, dateKey, final]
  );
  const sorted = useMemo(() => {
    if (sort === "protein" || sort === "calories") {
      // Furthest from target first; no target / nothing logged last.
      const gap = (r) => (r.logged && r[sort].target ? Math.abs(r[sort].diff) / r[sort].target : -1);
      return rows.slice().sort((a, b) => gap(b) - gap(a));
    }
    return sortRows(rows, sort, NUTRITION_STATUS);
  }, [rows, sort]);

  const loggedCount = rows.filter((r) => r.logged).length;
  const withTargets = rows.filter((r) => r.logged && r.assigned);
  const stats = [
    { filter: "logged", value: `${loggedCount}/${rows.length}`, label: "Logged meals" },
    { filter: "protein", value: withTargets.filter((r) => r.protein.state !== "under").length, label: "Protein hit", tone: "green" },
    { filter: "calories", value: withTargets.filter((r) => r.calories.state === "hit").length, label: "Calories on target", tone: "green" },
    { filter: "attention", value: rows.filter(nutritionNeedsAttention).length, label: "Need attention", tone: "red" },
  ];

  return (
    <OverviewPanel
      id="nutrition"
      icon={Utensils}
      title="Nutrition"
      subtitle={`${final ? "Yesterday" : "Today"} · ${shortDate(dateKey)} · ${final ? "full day" : "in progress"}`}
      headerRight={
        <div className="flex rounded-full p-0.5 shrink-0" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }} role="group" aria-label="Diary day">
          {[
            ["today", "Today"],
            ["yesterday", "Yesterday"],
          ].map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setDay(k)}
              aria-pressed={day === k}
              data-testid={`cc-nutrition-day-${k}`}
              className="h-6 px-2.5 rounded-full text-[11px] font-semibold transition-colors"
              style={day === k ? { backgroundColor: "#fff", color: "#000" } : { color: "rgba(255,255,255,0.65)" }}
            >
              {l}
            </button>
          ))}
        </div>
      }
      stats={stats}
      filters={NUTRITION_FILTERS}
      filter={filter}
      setFilter={setFilter}
      sort={sort}
      setSort={setSort}
      sortOptions={NUTRITION_SORTS}
      rows={sorted}
      ready={ready}
      emptyText="No clients match this filter."
      renderRow={(r) => {
        const inProgress = !final;
        const detail = r.logged
          ? `${r.meals} meal${r.meals === 1 ? "" : "s"} · ${r.itemCount} item${r.itemCount === 1 ? "" : "s"}${r.lastLoggedAt ? ` · last logged ${clockTime(r.lastLoggedAt)}` : ""}`
          : `No meals logged ${final ? "yesterday" : "yet today"}`;
        return (
          <ClientRow
            key={r.client.id}
            row={r}
            table={NUTRITION_STATUS}
            testId={`cc-nutrition-row-${r.client.id}`}
            onOpen={() => onOpenClient(r.client.id)}
            measures={[measureFromCompare(r.protein, "Protein", "g", inProgress), measureFromCompare(r.calories, "Calories", "kcal", inProgress)]}
            detail={detail}
            actions={[
              { icon: MessageSquare, label: "Message", testId: "cc-action-message", onClick: () => onMessage({ kind: "nutrition", client: r.client, suggestions: nutritionSuggestions(r, nutritionTrend(r.client, db.nutritionLogs?.[r.client.id], todayKey)) }) },
              { icon: BookOpen, label: "Diary", testId: "cc-action-diary", onClick: () => onOpenClient(r.client.id, { tab: "nutrition" }) },
              { icon: ChevronRight, label: "Profile", testId: "cc-action-profile", onClick: () => onOpenClient(r.client.id) },
            ]}
          />
        );
      }}
    />
  );
}

// ---- Training --------------------------------------------------------------
const TRAINING_FILTERS = [
  { id: "all", label: "All", test: () => true },
  { id: "attention", label: "Attention", test: trainingNeedsAttention },
  { id: "doneToday", label: "Done today", test: (r) => r.status === "doneToday" || !!r.today?.done },
  { id: "toDo", label: "Still to do", test: (r) => r.week.due > 0 },
  { id: "missed", label: "Missed", test: (r) => r.missed.length > 0 },
  { id: "behind", label: "Falling behind", test: (r) => r.status === "behind" },
  { id: "onTrack", label: "On track", test: (r) => r.status === "onTrack" },
  { id: "consistent", label: "Consistent", test: (r) => r.consistent },
  { id: "noSchedule", label: "Nothing scheduled", test: (r) => r.status === "noSchedule" },
];
const TRAINING_SORTS = [
  { id: "priority", label: "Priority" },
  { id: "rate", label: "Completion" },
  { id: "name", label: "Name" },
];

export function TrainingOverview({ clients, db, todayKey, ready, onOpenClient, onMessage }) {
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("priority");
  const rows = useMemo(
    () =>
      clients.map((c) =>
        trainingSummary(c, { workoutLogs: db.workoutLogs?.[c.id], scheduledWorkouts: db.scheduledWorkouts?.[c.id], phases: db.clientPhases?.[c.id] }, todayKey)
      ),
    [clients, db.workoutLogs, db.scheduledWorkouts, db.clientPhases, todayKey]
  );
  const sorted = useMemo(() => {
    if (sort === "rate") return rows.slice().sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101));
    return sortRows(rows, sort, TRAINING_STATUS);
  }, [rows, sort]);

  const dueToday = rows.filter((r) => r.today);
  const weekAssigned = rows.reduce((a, r) => a + r.week.assigned, 0);
  const weekDone = rows.reduce((a, r) => a + r.week.done, 0);
  const stats = [
    { filter: "doneToday", value: `${dueToday.filter((r) => r.today.done).length}/${dueToday.length}`, label: "Done today" },
    { filter: "toDo", value: `${weekDone}/${weekAssigned}`, label: "Sessions this week" },
    { filter: "missed", value: rows.filter((r) => r.missed.length > 0).length, label: "Missed a session", tone: "red" },
    { filter: "attention", value: rows.filter(trainingNeedsAttention).length, label: "Need attention", tone: "red" },
  ];

  return (
    <OverviewPanel
      id="training"
      icon={Dumbbell}
      title="Training"
      subtitle={`Today · ${shortDate(todayKey)} · last 7 days`}
      headerRight={null}
      stats={stats}
      filters={TRAINING_FILTERS}
      filter={filter}
      setFilter={setFilter}
      sort={sort}
      setSort={setSort}
      sortOptions={TRAINING_SORTS}
      rows={sorted}
      ready={ready}
      emptyText="No clients match this filter."
      renderRow={(r) => {
        const weekTone = r.week.assigned === 0 ? "muted" : r.missed.length ? "red" : r.week.done === r.week.assigned ? "green" : "blue";
        const weekText =
          r.week.assigned === 0
            ? "Nothing scheduled"
            : r.missed.length
              ? `${r.missed.length} missed${r.week.due ? ` · ${r.week.due} to do` : ""}`
              : r.week.due
                ? `${r.week.due} still to do`
                : "All sessions done";
        const prog = r.program;
        const programMeasure = prog
          ? {
              label: "Program",
              actual: `Wk ${prog.week}`,
              target: prog.weeks ? prog.weeks : null,
              unit: "",
              diffText: `${prog.name}${prog.sessionsTotal ? ` · ${prog.sessionsDone}/${prog.sessionsTotal} sessions` : ""}`,
              tone: "blue",
              pct: prog.pct ?? 0,
            }
          : { label: "Program", actual: "–", target: null, unit: "", diffText: "No current phase", tone: "muted", pct: 0 };
        const last = r.lastLog ? `Last: ${r.lastLog.dayLabel || "Workout"} ${daysAgoLabel(r.daysSinceLast)}` : "No sessions logged yet";
        const next = r.next ? `Next: ${r.next.label || "Session"} ${r.next.date === todayKey ? "today" : shortDate(r.next.date)}` : "Nothing upcoming";
        const rate = r.rate !== null ? ` · ${r.rate}% over 4 wks${r.consistent ? " ✓" : ""}` : "";
        return (
          <ClientRow
            key={r.client.id}
            row={r}
            table={TRAINING_STATUS}
            testId={`cc-training-row-${r.client.id}`}
            onOpen={() => onOpenClient(r.client.id)}
            measures={[
              { label: "This week", actual: `${r.week.done}`, target: r.week.assigned || null, unit: r.week.assigned ? "" : " sessions", diffText: weekText, tone: weekTone, pct: r.week.assigned ? (r.week.done / r.week.assigned) * 100 : 0 },
              programMeasure,
            ]}
            detail={`${last} · ${next}${rate}`}
            actions={[
              { icon: MessageSquare, label: "Message", testId: "cc-action-message", onClick: () => onMessage({ kind: "training", client: r.client, suggestions: trainingSuggestions(r) }) },
              { icon: History, label: "History", testId: "cc-action-history", onClick: () => onOpenClient(r.client.id, { tab: "program" }) },
              { icon: ChevronRight, label: "Profile", testId: "cc-action-profile", onClick: () => onOpenClient(r.client.id) },
            ]}
          />
        );
      }}
    />
  );
}

// ---- The two panels together, as placed on Overview ------------------------
export default function CommandCentre({ clients, db, todayKey, ready, onOpenClient, showToast }) {
  const [messageTarget, setMessageTarget] = useState(null);
  const open = (id, action) => onOpenClient?.(id, action);
  const onMessage = (t) => setMessageTarget({ ...t, onSent: showToast });
  return (
    <div className="relative mx-3.5 md:mx-0 mb-7" data-testid="command-centre">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 xl:gap-4 items-start">
        <TrainingOverview clients={clients} db={db} todayKey={todayKey} ready={ready} onOpenClient={open} onMessage={onMessage} />
        <NutritionOverview clients={clients} db={db} todayKey={todayKey} ready={ready} onOpenClient={open} onMessage={onMessage} />
      </div>
      <MessageSheet
        target={messageTarget}
        onClose={() => setMessageTarget(null)}
        onOpenChat={(id) => {
          setMessageTarget(null);
          open(id, { messages: true });
        }}
      />
    </div>
  );
}
