// Coach Overview → Training and Nutrition command centre (#261, owner).
//
// Two matching open sections (no boxes, owner: "way too much going on"):
// a title, three large figures (each one a filter — tap again to clear),
// then one quiet row per client: name, one line of figures, a status dot.
// Tapping a row opens the client sheet with the measured figures (exact
// differences + thin bars) and the actions: Message (suggestions written
// from the client's own figures, edited, sent through sendMessage),
// Diary / History, and Profile. Every figure comes from commandCentre.js.
import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/AppContext";
import { Avatar, BottomSheet } from "../components/ui";
import { MEASURE_BLUE, GOAL_GREEN, OVER_RED } from "../theme";
import { GLASS_BLUE, GlassButton, SHEET_GLASS } from "./darkUI";
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
import { Send, ExternalLink, BookOpen, History, MessageSquare, UserRound, Sparkles, ArrowLeft } from "lucide-react";

const PREVIEW_ROWS = 5;
const TONE = { green: GOAL_GREEN, red: OVER_RED, blue: MEASURE_BLUE, muted: "rgba(255,255,255,0.35)" };
const ROW_RULE = "rgba(255,255,255,0.07)";

const fmt = (n) => Math.round(n).toLocaleString();
function shortDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
}
function weekday(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short" });
}
function clockTime(ms) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function daysAgoLabel(n) {
  if (n === null || n === undefined) return "";
  return n === 0 ? "today" : n === 1 ? "yesterday" : `${n}d ago`;
}

// ---- shared building blocks (identical in both sections) -------------------
// Frosted glass like Overview's tiles and Coach's notes (#227): see-through
// fill, hairline border, blur. The section is one pane; the figures and the
// controls are lighter panes on it.
const PANE = {
  // Black frosted glass (owner: "more frosted", then "black not grey"): a
  // near-black see-through fill with only a faint sheen at the top, heavy
  // blur, and a bright hairline top edge.
  background: "linear-gradient(160deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0) 35%), rgba(4,4,6,0.72)",
  border: "1px solid rgba(255,255,255,0.13)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16), 0 24px 48px -28px rgba(0,0,0,0.95)",
  backdropFilter: "blur(40px) saturate(160%)",
  WebkitBackdropFilter: "blur(40px) saturate(160%)",
};
const TILE = {
  background: "rgba(0,0,0,0.55)",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
};

function StatusText({ status, table }) {
  const s = table[status];
  const c = s.tone === "muted" ? "rgba(255,255,255,0.6)" : TONE[s.tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 shrink-0 rounded-full px-2.5 h-6 text-[11px] font-semibold whitespace-nowrap"
      style={{ color: c, background: s.tone === "muted" ? "rgba(255,255,255,0.05)" : `${TONE[s.tone]}14`, border: `1px solid ${s.tone === "muted" ? "rgba(255,255,255,0.12)" : `${TONE[s.tone]}40`}` }}
      data-testid="cc-status"
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: TONE[s.tone] }} />
      {s.label}
    </span>
  );
}

// A large figure on a glass tile that doubles as a filter (tap again to clear).
function Figure({ value, label, tone, active, onClick, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className="text-left min-w-0 rounded-xl px-3.5 py-3 active:scale-[0.97] transition-[transform,background] duration-150"
      style={active ? GLASS_BLUE : TILE}
    >
      <span className="block text-[26px] sm:text-[30px] font-semibold tracking-[-0.04em] leading-none tabular-nums" style={{ color: tone ? TONE[tone] : "#fff" }}>
        {value}
      </span>
      <span className={`block text-[11.5px] leading-tight mt-1.5 ${active ? "text-white font-semibold" : "text-white/60"}`}>{label}</span>
    </button>
  );
}

function Section({ id, title, meta, headerRight, figures, filter, setFilter, rows, filters, ready, renderLine, onOpen, table }) {
  const [showAll, setShowAll] = useState(false);
  const test = filters[filter] || (() => true);
  const visible = rows.filter(test);
  const shown = showAll ? visible : visible.slice(0, PREVIEW_ROWS);
  const activeFigure = figures.find((f) => f.filter === filter);
  return (
    <section className="min-w-0 rounded-[22px] overflow-hidden" style={PANE} data-testid={`cc-${id}`} aria-label={`${title} overview`}>
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3 mb-3 min-h-[32px]">
          <h2 className="text-white text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
          {headerRight || <span className="text-white/50 text-[12.5px] truncate">{meta}</span>}
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${figures.length}, minmax(0, 1fr))` }}>
          {figures.map((f) => (
            <Figure key={f.filter} {...f} value={ready ? f.value : "–"} active={filter === f.filter} onClick={() => setFilter(filter === f.filter ? "all" : f.filter)} testId={`cc-${id}-stat-${f.filter}`} />
          ))}
        </div>
        {activeFigure && (
          <div className="flex items-center justify-between mt-2.5 text-[12px]">
            <span className="text-white/60">
              Showing <span className="text-white font-semibold">{activeFigure.label.toLowerCase()}</span> · {visible.length}
            </span>
            <button type="button" onClick={() => setFilter("all")} className="font-semibold px-2 py-1 -my-1" style={{ color: MEASURE_BLUE }} data-testid={`cc-${id}-clear`}>
              Show everyone
            </button>
          </div>
        )}
      </div>
      <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.10)" }} data-testid={`cc-${id}-list`}>
        {!ready ? (
          <p className="text-white/45 text-[13px] text-center py-6">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="text-white/55 text-[13px] text-center py-6">{rows.length === 0 ? "No active clients yet." : "No clients here right now."}</p>
        ) : (
          shown.map((r) => (
            <div
              key={r.client.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(r)}
              onKeyDown={(e) => e.key === "Enter" && onOpen(r)}
              data-testid={`cc-${id}-row-${r.client.id}`}
              className="flex items-center gap-3 pl-4 pr-2.5 py-2.5 min-h-[60px] border-b last:border-0 cursor-pointer hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors"
              style={{ borderColor: ROW_RULE }}
            >
              <Avatar name={r.client.name} url={r.client.avatarUrl} size={32} dark />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="flex-1 min-w-0 text-white text-[14px] font-semibold truncate">{r.client.name}</p>
                  <StatusText status={r.status} table={table} />
                </div>
                <p className="text-white/50 text-[12px] truncate tabular-nums mt-0.5">{renderLine(r)}</p>
              </div>
              {/* One tap straight to a message; the row itself opens the details. */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(r, { compose: true });
                }}
                aria-label={`Message ${r.client.name}`}
                data-testid="cc-row-message"
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 active:scale-[0.94] transition-transform"
                style={TILE}
              >
                <MessageSquare size={15} className="text-white/85" />
              </button>
            </div>
          ))
        )}
        {ready && visible.length > PREVIEW_ROWS && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full py-3.5 text-[13px] font-semibold border-t" style={{ color: MEASURE_BLUE, borderColor: ROW_RULE }} data-testid={`cc-${id}-more`}>
            {showAll ? "Show fewer" : `Show all ${visible.length}`}
          </button>
        )}
      </div>
    </section>
  );
}

// One measured figure in the client sheet: "actual / target", a thin bar
// and the exact difference.
function Measure({ label, actual, target, unit, diffText, tone, pct }) {
  return (
    <div className="min-w-0">
      <p className="text-white/45 text-[10.5px] font-semibold tracking-[0.08em] uppercase">{label}</p>
      <p className="text-white text-[22px] font-semibold tracking-[-0.03em] mt-1 tabular-nums leading-none">
        {actual}
        {target != null && <span className="text-white/40 text-[15px] font-medium"> / {target}{unit}</span>}
        {target == null && unit && <span className="text-white/40 text-[15px] font-medium">{unit}</span>}
      </p>
      <div className="h-[3px] rounded-full mt-2.5 overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct || 0))}%`, backgroundColor: TONE[tone] }} />
      </div>
      <p className="text-[12px] mt-1.5" style={{ color: tone === "muted" ? "rgba(255,255,255,0.45)" : TONE[tone] }}>
        {diffText}
      </p>
    </div>
  );
}

// ---- Client sheet: figures + actions, and the message composer ------------
function ClientSheet({ target, onClose, onOpenClient, showToast }) {
  const { sendMessage } = useApp();
  const [composing, setComposing] = useState(false);
  // The row's message button opens the sheet straight on the composer.
  // The composer opens with the first (most relevant) suggestion already
  // in the box, ready to edit or send.
  function startCompose() {
    const first = target?.suggestions?.()[0] || "";
    setText(first);
    setPicked(first ? 0 : null);
    setComposing(true);
  }
  useEffect(() => {
    if (target?.compose) startCompose();
    else if (target) setComposing(false);
  }, [target]);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState(null);
  const first = target?.client?.name?.split(" ")[0] || "client";

  function reset() {
    setComposing(false);
    setText("");
    setPicked(null);
  }
  function close() {
    reset();
    onClose();
  }
  function go(action) {
    const id = target.client.id;
    close();
    onOpenClient(id, action);
  }
  function send() {
    const body = text.trim();
    if (!body || !target) return;
    sendMessage(target.client.id, "coach", body);
    showToast?.(`Message sent to ${first}`);
    close();
  }

  return (
    <BottomSheet open={!!target} onClose={close} title={composing ? `Message ${first}` : target?.client?.name || ""} dark surface={SHEET_GLASS} backdropClassName="bg-black/40">
      {target && !composing && (
        <div style={{ color: "#fff" }} data-testid="cc-client-sheet">
          <div className="mb-5">
            <StatusText status={target.row.status} table={target.table} />
          </div>
          <div className="grid grid-cols-2 gap-5 mb-4">
            {target.measures.map((m) => (
              <Measure key={m.label} {...m} />
            ))}
          </div>
          <p className="text-white/55 text-[12.5px] leading-relaxed mb-5 pt-3 border-t" style={{ borderColor: ROW_RULE }}>
            {target.detail}
          </p>
          <div className="grid grid-cols-3 gap-2">
            <GlassButton tone="blue" onClick={startCompose} data-testid="cc-action-message">
              <MessageSquare size={13} /> Message
            </GlassButton>
            {target.kind === "nutrition" ? (
              <GlassButton onClick={() => go({ tab: "nutrition" })} data-testid="cc-action-diary">
                <BookOpen size={13} /> Diary
              </GlassButton>
            ) : (
              <GlassButton onClick={() => go({ tab: "program" })} data-testid="cc-action-history">
                <History size={13} /> History
              </GlassButton>
            )}
            <GlassButton onClick={() => go(undefined)} data-testid="cc-action-profile">
              <UserRound size={13} /> Profile
            </GlassButton>
          </div>
        </div>
      )}
      {target && composing && (
        <div style={{ color: "#fff" }} data-testid="cc-message-sheet">
          <p className="flex items-center gap-1.5 text-white/55 text-[11px] font-semibold tracking-[0.08em] uppercase mb-2">
            <Sparkles size={11} style={{ color: MEASURE_BLUE }} /> Suggested from {first}'s {target.kind}
          </p>
          <div className="space-y-1.5 mb-4">
            {target.suggestions().map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setPicked(i);
                  setText(s);
                }}
                data-testid="cc-suggestion"
                className="w-full text-left rounded-xl px-3 py-2.5 text-[13px] leading-snug text-white/90"
                style={picked === i ? GLASS_BLUE : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}
              >
                {s}
              </button>
            ))}
          </div>
          <textarea
            aria-label="Your message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Pick a suggestion or write your own…"
            data-testid="cc-message-text"
            className="w-full rounded-xl px-3.5 py-3 text-[14px] leading-relaxed text-white outline-none placeholder:text-white/35 resize-none"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}
          />
          <div className="grid grid-cols-3 gap-2 mt-3">
            <GlassButton onClick={() => setComposing(false)}>
              <ArrowLeft size={13} /> Back
            </GlassButton>
            <GlassButton onClick={() => go({ messages: true })}>
              <ExternalLink size={13} /> Chat
            </GlassButton>
            <GlassButton tone="blue" onClick={send} disabled={!text.trim()} data-testid="cc-message-send">
              <Send size={13} /> Send
            </GlassButton>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

// ---- Nutrition -------------------------------------------------------------
const NUTRITION_FILTERS = {
  calories: (r) => r.logged && r.assigned && r.calories.state === "hit",
  protein: (r) => r.logged && r.assigned && r.protein.state !== "under",
  attention: nutritionNeedsAttention,
};

function measureFromCompare(cmp, label, unit, inProgress) {
  const kcal = unit === "kcal";
  if (cmp.target == null) return { label, actual: kcal ? fmt(cmp.actual) : `${cmp.actual}g`, target: null, unit: kcal ? " kcal" : "", diffText: "No target assigned", tone: "muted", pct: 0 };
  const tone = cmp.state === "hit" ? "green" : cmp.state === "over" ? (kcal ? "red" : "blue") : inProgress ? "blue" : "red";
  const abs = kcal ? fmt(Math.abs(cmp.diff)) : Math.abs(cmp.diff);
  const u = kcal ? " kcal" : "g";
  const diffText = cmp.state === "hit" ? (kcal ? "Target reached" : "Goal completed") : cmp.state === "over" ? `${abs}${u} over` : `${abs}${u} ${inProgress ? "to go" : "under"}`;
  return { label, actual: kcal ? fmt(cmp.actual) : `${cmp.actual}`, target: kcal ? fmt(cmp.target) : cmp.target, unit: kcal ? "" : "g", diffText, tone, pct: (cmp.actual / cmp.target) * 100 };
}

export function NutritionOverview({ clients, db, todayKey, ready, onOpen }) {
  const [day, setDay] = useState("today");
  const [filter, setFilter] = useState("all");
  const dateKey = day === "today" ? todayKey : addDaysKey(todayKey, -1);
  const final = day !== "today";
  const rows = useMemo(() => sortRows(clients.map((c) => nutritionDay(c, db.nutritionLogs?.[c.id], dateKey, { final })), "priority", NUTRITION_STATUS), [clients, db.nutritionLogs, dateKey, final]);
  const withTargets = rows.filter((r) => r.logged && r.assigned);

  const open = (r, opts) => {
    const inProgress = !final;
    onOpen({
      kind: "nutrition",
      compose: !!opts?.compose,
      client: r.client,
      row: r,
      table: NUTRITION_STATUS,
      measures: [measureFromCompare(r.protein, "Protein", "g", inProgress), measureFromCompare(r.calories, "Calories", "kcal", inProgress)],
      detail: r.logged
        ? `${final ? "Yesterday" : "Today"}: ${r.meals} meal${r.meals === 1 ? "" : "s"}, ${r.itemCount} item${r.itemCount === 1 ? "" : "s"}${r.lastLoggedAt ? ` · last logged ${clockTime(r.lastLoggedAt)}` : ""}`
        : `No meals logged ${final ? "yesterday" : "yet today"}.`,
      suggestions: () => nutritionSuggestions(r, nutritionTrend(r.client, db.nutritionLogs?.[r.client.id], todayKey)),
    });
  };

  return (
    <Section
      id="nutrition"
      title="Nutrition"
      table={NUTRITION_STATUS}
      headerRight={
        <div className="flex rounded-full p-0.5" style={TILE} role="group" aria-label="Diary day">
          {[
            ["today", "Today"],
            ["yesterday", "Yesterday"],
          ].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setDay(k)} aria-pressed={day === k} data-testid={`cc-nutrition-day-${k}`} className="h-8 px-3.5 rounded-full text-[12.5px] font-semibold transition-colors" style={day === k ? { backgroundColor: "#fff", color: "#000" } : { color: "rgba(255,255,255,0.6)" }}>
              {l}
            </button>
          ))}
        </div>
      }
      figures={[
        { filter: "calories", value: withTargets.filter((r) => r.calories.state === "hit").length, label: "Hit calories" },
        { filter: "protein", value: withTargets.filter((r) => r.protein.state !== "under").length, label: "Hit protein" },
        { filter: "attention", value: rows.filter(nutritionNeedsAttention).length, label: "Need attention" },
      ]}
      filter={filter}
      setFilter={setFilter}
      filters={NUTRITION_FILTERS}
      rows={rows}
      ready={ready}
      onOpen={open}
      renderLine={(r) =>
        !r.logged
          ? "No meals logged"
          : r.assigned
            ? `${r.protein.actual}/${r.protein.target}g P · ${fmt(r.calories.actual)}/${fmt(r.calories.target)} kcal`
            : `${r.protein.actual}g P · ${fmt(r.calories.actual)} kcal`
      }
    />
  );
}

// ---- Training --------------------------------------------------------------
const TRAINING_FILTERS = {
  doneToday: (r) => !!r.today,
  attention: trainingNeedsAttention,
};

export function TrainingOverview({ clients, db, todayKey, ready, onOpen }) {
  const [filter, setFilter] = useState("all");
  const rows = useMemo(
    () =>
      sortRows(
        clients.map((c) => trainingSummary(c, { workoutLogs: db.workoutLogs?.[c.id], scheduledWorkouts: db.scheduledWorkouts?.[c.id], phases: db.clientPhases?.[c.id] }, todayKey)),
        "priority",
        TRAINING_STATUS
      ),
    [clients, db.workoutLogs, db.scheduledWorkouts, db.clientPhases, todayKey]
  );
  const dueToday = rows.filter((r) => r.today);
  const nextText = (r) => (r.next ? `Next: ${r.next.label || "Session"} ${r.next.date === todayKey ? "today" : shortDate(r.next.date)}` : "Nothing upcoming");

  const open = (r, opts) => {
    const weekTone = r.week.assigned === 0 ? "muted" : r.missed.length ? "red" : r.week.done === r.week.assigned ? "green" : "blue";
    const weekText = r.week.assigned === 0 ? "Nothing scheduled" : r.missed.length ? `${r.missed.length} missed${r.week.due ? ` · ${r.week.due} to do` : ""}` : r.week.due ? `${r.week.due} still to do` : "All sessions done";
    const prog = r.program;
    onOpen({
      kind: "training",
      compose: !!opts?.compose,
      client: r.client,
      row: r,
      table: TRAINING_STATUS,
      measures: [
        { label: "Last 7 days", actual: `${r.week.done}`, target: r.week.assigned || null, unit: r.week.assigned ? "" : " sessions", diffText: weekText, tone: weekTone, pct: r.week.assigned ? (r.week.done / r.week.assigned) * 100 : 0 },
        prog
          ? { label: "Program", actual: `Wk ${prog.week}`, target: prog.weeks || null, unit: "", diffText: `${prog.name}${prog.sessionsTotal ? ` · ${prog.sessionsDone}/${prog.sessionsTotal} sessions` : ""}`, tone: "blue", pct: prog.pct ?? 0 }
          : { label: "Program", actual: "–", target: null, unit: "", diffText: "No current phase", tone: "muted", pct: 0 },
      ],
      detail: [r.lastLog ? `Last: ${r.lastLog.dayLabel || "Workout"} ${daysAgoLabel(r.daysSinceLast)}` : "No sessions logged yet", nextText(r), r.rate !== null ? `${r.rate}% of sessions done over 4 weeks` : null].filter(Boolean).join(" · "),
      suggestions: () => trainingSuggestions(r),
    });
  };

  return (
    <Section
      id="training"
      title="Training"
      meta={`Today · ${shortDate(todayKey)}`}
      table={TRAINING_STATUS}
      figures={[
        { filter: "doneToday", value: `${dueToday.filter((r) => r.today.done).length}/${dueToday.length}`, label: "Done today" },
        { filter: "attention", value: rows.filter(trainingNeedsAttention).length, label: "Need attention" },
      ]}
      filter={filter}
      setFilter={setFilter}
      filters={TRAINING_FILTERS}
      rows={rows}
      ready={ready}
      onOpen={open}
      renderLine={(r) => {
        const next = r.next ? `Next ${r.next.label || "session"} ${r.next.date === todayKey ? "today" : weekday(r.next.date)}` : "Nothing upcoming";
        return r.week.assigned ? `${r.week.done}/${r.week.assigned} done · ${next}` : next;
      }}
    />
  );
}

// ---- The two sections together, as placed on Overview ----------------------
export default function CommandCentre({ clients, db, todayKey, ready, onOpenClient, showToast }) {
  const [target, setTarget] = useState(null);
  return (
    <div className="relative mx-3.5 md:mx-0 mb-8" data-testid="command-centre">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <TrainingOverview clients={clients} db={db} todayKey={todayKey} ready={ready} onOpen={setTarget} />
        <NutritionOverview clients={clients} db={db} todayKey={todayKey} ready={ready} onOpen={setTarget} />
      </div>
      <ClientSheet target={target} onClose={() => setTarget(null)} onOpenClient={(id, action) => onOpenClient?.(id, action)} showToast={showToast} />
    </div>
  );
}
