import React, { useState, useMemo, useEffect, useRef } from "react";
import { useApp } from "../lib/AppContext";
import { localDateKey } from "../lib/dateKey";
import { isMealPlanEnded, mealPlanEndDateKey } from "../lib/mealPlanEnd";
import { Avatar, BottomSheet } from "../components/ui";
import { WorkoutLogCard } from "./CoachClientDetail";
import WorkoutEditor from "./WorkoutEditor";
import { resolveNutritionTargets } from "../lib/nutritionTargets";
import { computeApexInsights } from "../lib/apexInsights";
import { buildRecentActivity } from "../lib/recentActivity";
import { MEASURE_BLUE, CLIENT_DARK_BG, CLIENT_DARK_SURFACE, CLIENT_DARK_BORDER, GOAL_GREEN, OVER_RED } from "../theme";
import { DarkPage, DarkPanel } from "./darkUI";
import {
  CalendarPlus,
  CalendarClock,
  Trophy,
  MessageCircleOff,
  Send,
  Check,
  Utensils,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Trash2,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

function timeOfDayGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// The check-in's own Q&A, plus a reply box right there — so reviewing one
// from the dashboard doesn't require a separate trip into Messages first.
function CheckInReviewCard({ clientId, clientName, form, response, sendMessage, markFormResponseRead, showToast }) {
  const [reply, setReply] = useState("");
  const [sent, setSent] = useState(false);

  function send() {
    const text = reply.trim();
    if (!text) return;
    sendMessage(clientId, "coach", text);
    if (response.read === false) markFormResponseRead(response.id);
    setReply("");
    setSent(true);
    showToast?.(`Message sent to ${clientName?.split(" ")[0] || "your client"}`);
    setTimeout(() => setSent(false), 1800);
  }

  return (
    <div>
      <div className="space-y-3 mb-4">
        {(form?.questions || []).map((q) => (
          <div key={q.id} className="bg-black/5 rounded-xl px-3.5 py-2.5">
            <p className="text-black/40 text-[11px] tracking-wide mb-1">{q.label || "Untitled question"}</p>
            {q.type === "photo" && response.answers[q.id] ? (
              <img src={response.answers[q.id]} alt="" className="w-full rounded-lg mt-1 max-h-48 object-cover" />
            ) : (
              <p className="text-black text-sm">
                {q.type === "rating" && response.answers[q.id] ? `${response.answers[q.id]} / 5` : response.answers[q.id] || "—"}
              </p>
            )}
          </div>
        ))}
        {!form && <p className="text-black/30 text-sm">This check-in form was deleted.</p>}
      </div>
      <div className="border-t border-black/8 pt-3">
        <p className="text-black/40 text-xs font-semibold tracking-wide mb-2">REPLY TO {(clientName?.split(" ")[0] || "CLIENT").toUpperCase()}</p>
        <div className="flex gap-2">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Send a message about this check-in..."
            className="flex-1 min-w-0 bg-black/5 rounded-full px-4 py-2.5 text-sm text-black outline-none placeholder:text-black/30"
          />
          <button
            onClick={send}
            disabled={!reply.trim()}
            className="w-10 h-10 rounded-full bg-black flex items-center justify-center disabled:opacity-30 shrink-0"
            aria-label="Send message"
          >
            {sent ? <Check size={16} className="text-white" /> : <Send size={15} className="text-white" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function hasActivePhaseToday(phases, todayKey) {
  return phases.some((p) => p.startDate <= todayKey && (!p.endDate || p.endDate >= todayKey));
}

function daysUntil(dateKey, todayKey) {
  return Math.round((new Date(dateKey) - new Date(todayKey)) / 86400000);
}

function addDaysISO(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day === 1 ? "" : "s"} ago`;
}

function AvatarStack({ clients, max = 4, dark = false }) {
  const shown = clients.slice(0, max);
  const extra = clients.length - shown.length;
  const ringClass = dark ? "ring-2" : "ring-2 ring-white";
  const ringStyle = dark ? { "--tw-ring-color": CLIENT_DARK_SURFACE } : undefined;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((c) => (
        <div key={c.id} className={`${ringClass} rounded-full`} style={ringStyle}>
          <Avatar name={c.name} url={c.avatarUrl} size={30} dark={dark} />
        </div>
      ))}
      {extra > 0 && (
        <div
          className={`w-[30px] h-[30px] rounded-full flex items-center justify-center text-[11px] font-semibold ${ringClass} ${dark ? "bg-white/10 text-white" : "bg-black/8 text-black/50"}`}
          style={ringStyle}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}

function SegmentRow({ icon: Icon, label, clients, onViewAll }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b last:border-0" style={{ borderColor: CLIENT_DARK_BORDER }}>
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border"
        style={clients.length ? { backgroundColor: "rgba(47,143,255,0.12)", borderColor: "rgba(47,143,255,0.25)" } : { backgroundColor: "rgba(255,255,255,0.03)", borderColor: CLIENT_DARK_BORDER }}
      >
        <Icon size={16} style={{ color: clients.length ? MEASURE_BLUE : "rgba(255,255,255,0.25)" }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{label}</p>
      </div>
      {clients.length > 0 ? (
        <div className="flex items-center gap-2.5 shrink-0">
          <AvatarStack clients={clients} dark />
          <button onClick={onViewAll} className="text-xs font-semibold shrink-0 hover:opacity-80" style={{ color: MEASURE_BLUE }}>
            View All
          </button>
        </div>
      ) : (
        <span className="text-white text-xs shrink-0">All clear</span>
      )}
    </div>
  );
}

const NEEDS_ATTENTION_ICONS = { mealPlan: Utensils, apex: Sparkles, nutrition: Utensils, quiet: AlertTriangle, missed: CalendarClock, insight: TrendingUp };

// Swipe (or drag) left past the threshold to dismiss — reveals a red trash
// affordance underneath as it moves. Built on pointer events so it works
// with touch and mouse alike.
function SwipeableRow({ onDelete, children }) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const widthRef = useRef(0);
  const rowRef = useRef(null);

  function onPointerDown(e) {
    startXRef.current = e.clientX;
    widthRef.current = rowRef.current?.offsetWidth || 300;
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const dx = e.clientX - startXRef.current;
    setDragX(Math.min(0, Math.max(dx, -widthRef.current)));
  }
  function onPointerUp(e) {
    if (!dragging) return;
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (dragX < -(widthRef.current * 0.35)) {
      setDragX(-widthRef.current);
      setTimeout(onDelete, 150);
    } else {
      setDragX(0);
    }
  }

  return (
    <div ref={rowRef} className="relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-end pr-3" style={{ backgroundColor: OVER_RED }}>
        <Trash2 size={14} className="text-white" />
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ transform: `translateX(${dragX}px)`, transition: dragging ? "none" : "transform 200ms ease", backgroundColor: CLIENT_DARK_BG }}
        className="relative touch-pan-y select-none"
      >
        {children}
      </div>
    </div>
  );
}

function NeedsAttentionRow({ alert, onDismiss, onOpen }) {
  const isApex = alert.kind === "apex";
  const Icon = alert.kind === "insight" && alert.direction === "down" ? TrendingDown : NEEDS_ATTENTION_ICONS[alert.kind];
  return (
    <SwipeableRow onDelete={onDismiss}>
      <div
        onClick={isApex ? () => onOpen(alert) : undefined}
        className={`flex items-center gap-3 py-3 border-b last:border-0 ${isApex ? "cursor-pointer hover:bg-white/[0.03] -mx-1 px-1 rounded-lg" : ""}`}
        style={{ borderColor: CLIENT_DARK_BORDER }}
      >
        <Avatar name={alert.client.name} url={alert.client.avatarUrl} size={32} dark />
        <div className="flex-1 min-w-0">
          <p className="text-white text-[13px] leading-snug">
            {isApex && (
              <span className="inline-flex items-center gap-1 font-semibold text-[10px] tracking-wide uppercase mr-1.5 align-middle" style={{ color: MEASURE_BLUE }}>
                <Sparkles size={10} /> Apex Insight
              </span>
            )}
            <span className="font-semibold text-white">{alert.client.name}</span> — {alert.title}
          </p>
          <p className="text-white text-[11px] mt-0.5">{alert.detail}</p>
        </div>
        <Icon size={16} className="shrink-0" style={{ color: isApex ? MEASURE_BLUE : OVER_RED }} />
      </div>
    </SwipeableRow>
  );
}

// Coach Overview → Needs Attention → APEX Insight → Why you're seeing this →
// Relevant client context → APEX Suggestion → coach takes action. Every
// value shown here comes straight off the alert object computeApexInsights
// built, i.e. straight off real client data — nothing is generated inside
// this component.
function ApexInsightSheet({ alert, onClose, onDismiss, onReviewClient, sendMessage, showToast, phraseApexSuggestion }) {
  const [messaging, setMessaging] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  // Starts as the rule's own static suggestion, then — if the coach has
  // the server-side LLM call configured (see phraseApexSuggestion in
  // AppContext.jsx) — gets replaced with a version phrased from the exact
  // same reasons. It never introduces a new fact: the reasons array (real
  // data the rule already verified) is all either version can draw from.
  const [suggestion, setSuggestion] = useState(alert?.suggestion || "");

  useEffect(() => {
    if (!alert) return;
    setSuggestion(alert.suggestion);
    let cancelled = false;
    phraseApexSuggestion(alert.title, alert.reasons, alert.suggestion).then((s) => {
      if (!cancelled) setSuggestion(s);
    });
    return () => {
      cancelled = true;
    };
  }, [alert?.id]);

  if (!alert) return null;

  function send() {
    const text = message.trim();
    if (!text) return;
    sendMessage(alert.client.id, "coach", text);
    setSent(true);
    showToast?.(`Message sent to ${alert.client.name?.split(" ")[0] || "your client"}`);
    setTimeout(() => {
      setMessage("");
      setMessaging(false);
      setSent(false);
    }, 1200);
  }

  return (
    <BottomSheet open={!!alert} onClose={onClose} title={alert.title}>
      <div className="flex items-center gap-2.5 mb-4">
        <Avatar name={alert.client.name} url={alert.client.avatarUrl} size={36} />
        <div>
          <p className="text-black font-semibold text-sm">{alert.client.name}</p>
          <span className="inline-flex items-center gap-1 text-blue-600 font-semibold text-[10px] tracking-wide uppercase">
            <Sparkles size={10} /> Apex Insight
          </span>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-2">WHY YOU'RE SEEING THIS</p>
        <div className="space-y-1.5">
          {alert.reasons.map((r, i) => (
            <div key={i} className="bg-black/[0.03] rounded-lg px-3 py-2">
              <p className="text-black/80 text-sm">{r}</p>
            </div>
          ))}
        </div>
      </div>

      {alert.relevantContext?.length > 0 && (
        <div className="mb-4">
          <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-2">RELEVANT CLIENT CONTEXT</p>
          <div className="space-y-1.5">
            {alert.relevantContext.map((c) => (
              <div key={c.id} className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                <p className="text-blue-900 text-sm">
                  {c.source === "note" ? "Previous coach note: " : ""}
                  {c.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-5">
        <p className="text-black/35 text-[11px] font-semibold tracking-wide mb-2">APEX SUGGESTION</p>
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-3">
          <p className="text-blue-900 text-sm">{suggestion}</p>
        </div>
        <p className="text-black/25 text-[10px] mt-2">Advisory only — APEX never changes a client's program, targets, or goals. You decide what to do next.</p>
      </div>

      {messaging ? (
        <div className="border-t border-black/8 pt-3 mb-2">
          <p className="text-black/40 text-xs font-semibold tracking-wide mb-2">MESSAGE {(alert.client.name?.split(" ")[0] || "CLIENT").toUpperCase()}</p>
          <div className="flex gap-2">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Type a message..."
              autoFocus
              className="flex-1 min-w-0 bg-black/5 rounded-full px-4 py-2.5 text-sm text-black outline-none placeholder:text-black/30"
            />
            <button
              onClick={send}
              disabled={!message.trim()}
              className="w-10 h-10 rounded-full bg-black flex items-center justify-center disabled:opacity-30 shrink-0"
              aria-label="Send message"
            >
              {sent ? <Check size={16} className="text-white" /> : <Send size={15} className="text-white" />}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <button onClick={onReviewClient} className="w-full bg-black text-white text-sm font-semibold py-2.5 rounded-xl">
            Review Client
          </button>
          <button onClick={() => setMessaging(true)} className="w-full bg-black/5 text-black text-sm font-semibold py-2.5 rounded-xl">
            Message Client
          </button>
          <button onClick={onDismiss} className="w-full text-black/40 text-sm font-medium py-2">
            Dismiss
          </button>
        </div>
      )}
    </BottomSheet>
  );
}

function ActivityItem({ item, onClick }) {
  const clickable = (item.type === "workout" && !!item.log) || (item.type === "checkin" && !!item.response) || (item.type === "weighin" && !!item.clientId);
  return (
    <div
      onClick={clickable ? onClick : undefined}
      // No last:border-0 here — this renders inside a two-column CSS layout
      // on desktop (see the Recent Activity card in CoachDashboard.jsx),
      // where "last child" doesn't line up with "visually last in either
      // column", so every row keeps its own divider instead.
      className={`break-inside-avoid flex items-start gap-3 py-3 border-b ${clickable ? "cursor-pointer hover:bg-white/[0.03] -mx-1 px-1 rounded-lg" : ""}`}
      style={{ borderColor: CLIENT_DARK_BORDER }}
    >
      <Avatar name={item.clientName} url={item.clientAvatar} size={32} dark />
      <div className="flex-1 min-w-0">
        <p className="text-white text-[13px] leading-snug">
          <span className="font-semibold text-white">{item.clientName}</span> {item.verb}{" "}
          {item.subject && (
            <span className="font-medium" style={{ color: MEASURE_BLUE }}>
              {item.subject}
            </span>
          )}
          {item.suffix}
        </p>
        <p className="text-white text-[11px] mt-1">
          {timeAgo(item.date)}
          {clickable && <span className="font-medium" style={{ color: MEASURE_BLUE }}> · Tap to view</span>}
        </p>
      </div>
    </div>
  );
}

// A running note only the coach sees — separate from the per-client "Focus
// for next week" note on each client's own Weekly Coach Review, this is
// general/business-level scratch space (plans, reminders, things to
// follow up on) that isn't tied to any one client.
function CoachNotesCard({ currentUser, updateUser, showToast }) {
  const serverValue = currentUser?.coachNotes || "";
  const [notes, setNotes] = useState(serverValue);
  const [saving, setSaving] = useState(false);
  // Explicit dirty flag rather than deriving it from notes !== serverValue:
  // deriving it meant this only ever seeded from the server ONCE, at
  // mount, to avoid a save's own echo (arriving back through the realtime
  // listener) clobbering keystrokes typed after that save started. But
  // that also meant if currentUser.coachNotes was still empty/stale at
  // this component's very first render (e.g. right after sign-in, before
  // Firestore's first snapshot lands), it stayed stuck blank forever —
  // typing "into" it from there just overwrote whatever was actually
  // saved, which is exactly what looked like "notes aren't saving."
  // Tracking dirty explicitly lets a not-yet-edited textarea keep picking
  // up the real server value whenever it arrives, while still protecting
  // in-progress edits once the coach actually starts typing.
  const [dirty, setDirty] = useState(false);
  const lastServerValueRef = useRef(serverValue);

  useEffect(() => {
    if (serverValue === lastServerValueRef.current) return;
    lastServerValueRef.current = serverValue;
    if (!dirty) setNotes(serverValue);
  }, [serverValue, dirty]);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await updateUser(currentUser.id, { coachNotes: notes });
      lastServerValueRef.current = notes;
      setDirty(false);
      showToast?.("Notes saved");
    } catch (err) {
      showToast?.(err.message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="relative flex items-baseline justify-between mb-2.5">
        <h2 className="text-white text-[17px] font-semibold tracking-[-0.01em]">Coach's notes</h2>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="text-[13px] font-semibold disabled:opacity-35 transition-opacity"
          style={{ color: MEASURE_BLUE }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <textarea
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          setDirty(true);
        }}
        placeholder="Anything to remember — plans, reminders, things to follow up on. Only you can see this."
        rows={4}
        className="relative w-full border rounded-2xl px-4 py-3.5 text-sm leading-relaxed text-white outline-none placeholder:text-white/40 resize-none"
        style={{ backgroundColor: CLIENT_DARK_SURFACE, borderColor: "rgba(255,255,255,0.07)" }}
      />
    </div>
  );
}

// Section title over a thin rule, for the Overview's open (unboxed) lists.
function SectionHead({ title, meta }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-2.5">
      <h2 className="text-white text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
      {meta && <span className="text-white/50 text-[13px] truncate">{meta}</span>}
    </div>
  );
}

// Frosted-glass number tile over the hero photo's fade. `accent` tints it
// blue (used for Need attention when there's something to look at).
function GlassTile({ value, label, onClick, accent = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-2xl px-3.5 py-3 active:scale-[0.97] transition-transform"
      style={{
        backgroundColor: accent ? "rgba(47,143,255,0.16)" : "rgba(255,255,255,0.06)",
        border: `1px solid ${accent ? "rgba(47,143,255,0.45)" : "rgba(255,255,255,0.12)"}`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
        backdropFilter: "blur(18px) saturate(140%)",
        WebkitBackdropFilter: "blur(18px) saturate(140%)",
      }}
    >
      <span className="block text-white text-[24px] font-semibold tracking-[-0.02em] leading-none tabular-nums">{value}</span>
      <span className={`block text-[11.5px] leading-snug mt-1.5 ${accent ? "text-white/85" : "text-white/60"}`}>{label}</span>
    </button>
  );
}

export default function CoachDashboard({ onNavigate, onOpenClient, onOpenLibrary, showToast }) {
  const { db, sendMessage, markFormResponseRead, currentUser, updateUser, broadcastWorkout, phraseApexSuggestion, dismissErrorLog } = useApp();
  const needsAttentionRef = useRef(null);
  const clients = db.users.filter((u) => u.role === "client");
  const active = clients.filter((c) => c.status === "active");
  const todayKey = localDateKey();
  const newActiveThisWeek = active.filter((c) => c.createdAt && Date.now() - c.createdAt <= 7 * 86400000).length;
  const [viewingActivity, setViewingActivity] = useState(null); // the clicked Recent Activity item (workout or check-in) for the detail sheet
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [viewingApexAlert, setViewingApexAlert] = useState(null); // the tapped APEX Insight row, for its detail sheet
  const exercisesById = useMemo(() => Object.fromEntries((db.exercises || []).map((e) => [e.id, e])), [db.exercises]);

  // ---- smart segments ----
  const needsNewPhase = active.filter((c) => {
    const phases = (db.clientPhases || {})[c.id] || [];
    return !hasActivePhaseToday(phases, todayKey);
  });

  const phaseEndingSoon = active.filter((c) => {
    const phases = (db.clientPhases || {})[c.id] || [];
    const phase = phases.find((p) => p.startDate <= todayKey && (!p.endDate || p.endDate >= todayKey));
    if (!phase || !phase.endDate) return false;
    const days = daysUntil(phase.endDate, todayKey);
    return days >= 0 && days <= 7;
  });

  // A meal plan's last day = startDate + (weeksCount * 7 - 1) days. Shared
  // by the "ending soon" segment below (a week's lead time to build a
  // replacement) and the urgent Needs Attention entry further down (a
  // tighter 2-day window, since by then it's not just "plan ahead" — it's
  // "the client runs out very soon").
  function mealPlanDaysLeft(c) {
    const plan = (db.mealPlans[c.id] || [])[0];
    if (!plan?.startDate || !plan.days?.length) return null;
    const weeksCount = Math.max(...plan.days.map((d, i) => d.weekIndex ?? Math.floor(i / 7))) + 1;
    const endDateKey = addDaysISO(plan.startDate, weeksCount * 7 - 1);
    const days = daysUntil(endDateKey, todayKey);
    return days >= 0 ? days : null;
  }

  const mealPlanEndingSoon = active.filter((c) => {
    const days = mealPlanDaysLeft(c);
    return days !== null && days <= 7;
  });

  const sevenDaysAgo = Date.now() - 7 * 86400000;
  const newPRs = active.filter((c) => {
    const logs = db.workoutLogs[c.id] || [];
    return logs.some((log) => log.date >= sevenDaysAgo && log.entries.some((e) => e.sets.some((s) => s.isPR)));
  });

  const notMessagedLately = active.filter((c) => {
    const thread = db.messages[c.id] || [];
    const last = thread[thread.length - 1];
    return !last || last.date < sevenDaysAgo;
  });

  // "Needs Attention" — clients going quiet, a missed session that hasn't
  // been followed up on, or a notable bodyweight swing worth a check-in.
  // Computed on the fly from data already loaded, same as the segments
  // above — nothing persisted, so it's always current.
  const QUIET_DAYS = 5;
  const NUTRITION_QUIET_DAYS = 3;
  const KIND_PRIORITY = { mealPlan: 0, apex: 1, nutrition: 2, quiet: 3, missed: 4, insight: 5 };
  const needsAttention = [];
  active.forEach((c) => {
    // APEX AI Insights — cross-referenced patterns across training,
    // check-ins, body metrics and nutrition (see lib/apexInsights.js for
    // the rules and why each one only fires on a genuine, multi-signal
    // pattern rather than a single noisy data point).
    computeApexInsights(c, db).forEach((apexAlert) => needsAttention.push(apexAlert));

    const mealPlanDays = mealPlanDaysLeft(c);
    // Past its last day the client no longer sees the guide — flagged
    // until the coach builds the next one (or removes it).
    const endedPlan = (db.mealPlans[c.id] || [])[0];
    if (isMealPlanEnded(endedPlan, todayKey)) {
      needsAttention.push({
        id: `mealplan-${c.id}`,
        client: c,
        kind: "mealPlan",
        title: "Meal guide ended",
        detail: `Ended ${new Date(`${mealPlanEndDateKey(endedPlan)}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })} — it no longer shows in their app. Build their next one.`,
      });
    } else if (mealPlanDays !== null && mealPlanDays <= 2) {
      needsAttention.push({
        id: `mealplan-${c.id}`,
        client: c,
        kind: "mealPlan",
        title: "Meal guide running out",
        detail:
          mealPlanDays === 0
            ? "Ends today — build or duplicate their next week before they run out."
            : `Ends in ${mealPlanDays}d — build or duplicate their next week before they run out.`,
      });
    }

    // "Tracked food" means at least one item in some meal slot — logging
    // water alone still writes a nutritionLogs doc for that date, so an
    // empty `meals` object doesn't count as nutrition actually logged.
    const nutritionLogs = db.nutritionLogs[c.id] || [];
    const lastFoodLog = [...nutritionLogs].reverse().find((n) => n.meals && Object.values(n.meals).some((items) => items && items.length));
    const daysSinceFood = lastFoodLog
      ? -daysUntil(lastFoodLog.date, todayKey)
      : c.createdAt
        ? Math.floor((Date.now() - c.createdAt) / 86400000)
        : null;
    if (daysSinceFood !== null && daysSinceFood >= NUTRITION_QUIET_DAYS) {
      needsAttention.push({
        id: `nutrition-${c.id}`,
        client: c,
        kind: "nutrition",
        title: "Not tracking nutrition",
        detail: lastFoodLog
          ? `No food logged in ${daysSinceFood}d — worth a check-in on their nutrition.`
          : `Hasn't logged any food since joining ${daysSinceFood}d ago.`,
      });
    }

    const logs = db.workoutLogs[c.id] || [];
    const daysSinceWorkout = logs[0] ? Math.floor((Date.now() - logs[0].date) / 86400000) : null;
    // lastActiveAt is a real in-app-use heartbeat (see AppContext.jsx), not
    // just the last time Firebase Auth confirmed a sign-in — a client whose
    // session never needed to re-authenticate could sit on a stale
    // lastLoginAt for weeks despite opening the app constantly, which would
    // make this "gone quiet" check fire wrongly. Falls back to lastLoginAt
    // only for a client who hasn't opened the app again since this shipped.
    const lastOpenedAt = c.lastActiveAt || c.lastLoginAt;
    const daysSinceLogin = lastOpenedAt ? Math.floor((Date.now() - lastOpenedAt) / 86400000) : null;

    if (daysSinceWorkout !== null && daysSinceWorkout >= QUIET_DAYS && (daysSinceLogin === null || daysSinceLogin >= QUIET_DAYS)) {
      needsAttention.push({
        id: `quiet-${c.id}`,
        client: c,
        kind: "quiet",
        title: "Gone quiet",
        detail: `No training logged in ${daysSinceWorkout}d${daysSinceLogin !== null ? ` · last opened the app ${daysSinceLogin}d ago` : ""}.`,
      });
    }

    const loggedDateKeys = new Set(logs.map((l) => localDateKey(l.date)));
    const pastScheduled = (db.scheduledWorkouts[c.id] || []).filter((w) => w.date < todayKey);
    const missed = [...pastScheduled].reverse().find((w) => !loggedDateKeys.has(w.date));
    if (missed) {
      const daysAgo = -daysUntil(missed.date, todayKey);
      needsAttention.push({
        id: `missed-${c.id}`,
        client: c,
        kind: "missed",
        title: "Missed session",
        detail: `${missed.label || "A scheduled session"} (${daysAgo}d ago) wasn't logged — worth a follow-up message.`,
      });
    }

    const weighIns = db.weighIns[c.id] || [];
    if (weighIns.length >= 2) {
      const latest = weighIns[weighIns.length - 1];
      const priorOptions = weighIns.filter((w) => latest.date - w.date >= 13 * 86400000);
      const prior = priorOptions[priorOptions.length - 1];
      if (prior) {
        const delta = Math.round((latest.weight - prior.weight) * 10) / 10;
        if (Math.abs(delta) >= 1.5) {
          const days = Math.round((latest.date - prior.date) / 86400000);
          needsAttention.push({
            id: `weight-${c.id}`,
            client: c,
            kind: "insight",
            direction: delta > 0 ? "up" : "down",
            title: "Bodyweight change",
            detail: `${delta > 0 ? "Increased" : "Decreased"} ${Math.abs(delta)}kg over ${days} days.`,
          });
        }
      }
    }
  });
  needsAttention.sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]);

  // Swiping an alert away dismisses it for a week — long enough that it
  // doesn't just reappear on the next refresh, but if the client's still
  // quiet (or the session's still un-logged) a week later it resurfaces
  // rather than being silenced forever.
  const dismissedAlerts = currentUser?.dismissedAlerts || {};
  const visibleNeedsAttention = needsAttention.filter((a) => {
    const dismissedAt = dismissedAlerts[a.id];
    return !dismissedAt || Date.now() - dismissedAt > 7 * 86400000;
  });
  function dismissAlert(alertId) {
    updateUser(currentUser.id, { dismissedAlerts: { [alertId]: Date.now() } });
  }

  // Same "opening the thread clears it" gate as the roster pill and nav dot
  // (CoachClients.jsx, CoachShell.jsx) — without it this count could read
  // differently from those for the same client the moment the coach reads
  // (but hasn't yet replied to) a message.
  const awaitingReply = active.filter((c) => {
    const thread = db.messages[c.id] || [];
    const last = thread[thread.length - 1];
    return last && last.from === "client" && last.date > (c.coachMessagesSeenAt || 0);
  }).length;

  const pendingCheckinList = [];
  active.forEach((c) => {
    ((db.formResponses || {})[c.id] || [])
      .filter((r) => r.read === false)
      .forEach((r) => pendingCheckinList.push({ client: c, response: r }));
  });
  const pendingCheckins = pendingCheckinList.length;

  // ---- recent activity feed, merged across every active client ----
  const recentActivity = buildRecentActivity(active, db, resolveNutritionTargets);

  return (
    <DarkPage padded={false}>
      {/* Hero: black-and-white gym photo (same as the client app) behind the
          greeting and roster count, fading into the page. Every number is
          a button to the same place its old stat tile went. */}
      <div className="relative -mx-0 md:rounded-2xl md:overflow-hidden">
        <div className="absolute inset-x-0 top-0 -bottom-16 overflow-hidden pointer-events-none md:rounded-2xl" aria-hidden="true">
          <img src="/brand/gym-dark.jpg" alt="" className="w-full h-full object-cover" style={{ objectPosition: "50% 35%", filter: "brightness(0.7)" }} draggable={false} />
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(180deg, rgba(10,10,11,0.55) 0%, rgba(10,10,11,0.25) 40%, rgba(10,10,11,0.6) 70%, ${CLIENT_DARK_BG} 100%)` }}
          />
        </div>
        <div className="relative px-5 pt-10 pb-2 sm:px-7">
          <h1 className="text-white text-[24px] sm:text-[28px] font-semibold tracking-[-0.02em] leading-tight truncate">
            {timeOfDayGreeting()}, {currentUser?.name?.split(" ")[0] || "Coach"}
          </h1>
          <p className="text-white/70 text-[13.5px] mt-1">Your roster and what needs your attention.</p>
          <div className="flex items-end gap-4 mt-5">
            <button type="button" onClick={() => onNavigate("clients")} aria-label={`${active.length} active clients`} className="text-white text-[56px] font-semibold tracking-[-0.05em] leading-[0.9] tabular-nums">
              {active.length}
            </button>
            <div className="pb-1.5 text-[13px] leading-snug">
              <button type="button" onClick={() => onNavigate("clients")} className="block text-white/75 text-left">
                active clients{newActiveThisWeek > 0 && <span style={{ color: MEASURE_BLUE }}> · +{newActiveThisWeek} this week</span>}
              </button>
              <button type="button" onClick={() => onNavigate("challenges")} className="block text-white/75 text-left">
                {(db.challenges || []).length} challenge{(db.challenges || []).length === 1 ? "" : "s"} running
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Three frosted-glass tiles over the photo's fade. */}
      <div className="relative grid grid-cols-3 gap-2 mx-3.5 md:mx-0 mt-5 mb-6">
        <GlassTile
          value={visibleNeedsAttention.length}
          label="Need attention"
          accent={visibleNeedsAttention.length > 0}
          onClick={() => needsAttentionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
        <GlassTile
          value={pendingCheckins}
          label="Check-ins to review"
          onClick={() => {
            if (pendingCheckins === 1) {
              const { client, response } = pendingCheckinList[0];
              const form = (db.forms || []).find((f) => f.id === response.formId);
              setViewingActivity({ type: "checkin", clientId: client.id, clientName: client.name, subject: form?.name || "a check-in", response, form });
            } else {
              onNavigate("clients");
            }
          }}
        />
        <GlassTile value={awaitingReply} label="Messages to reply" onClick={() => onNavigate("messages")} />
      </div>

      <section ref={needsAttentionRef} className="relative mx-4 md:mx-0 mb-7 scroll-mt-20">
        <SectionHead title="Needs attention" meta={visibleNeedsAttention.length > 0 ? String(visibleNeedsAttention.length) : null} />
        <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.22)" }}>
          {visibleNeedsAttention.length === 0 ? (
            // Calm system-status panel, not a boring grey alert box — a
            // quiet confirmation that everything's fine, same restrained
            // language as the rest of the page rather than a dead end.
            <div className="flex flex-col items-center text-center py-8">
              <div className="w-11 h-11 rounded-full flex items-center justify-center mb-3 border" style={{ backgroundColor: "rgba(34,197,94,0.08)", borderColor: "rgba(34,197,94,0.2)" }}>
                <CheckCircle2 size={20} style={{ color: GOAL_GREEN }} />
              </div>
              <p className="text-white text-xs font-bold tracking-[0.12em] uppercase">All clients are on track</p>
              <p className="text-white text-xs mt-1.5">Nothing needs your attention right now.</p>
            </div>
          ) : (
            <>
              {visibleNeedsAttention.slice(0, 8).map((a) => (
                <NeedsAttentionRow key={a.id} alert={a} onDismiss={() => dismissAlert(a.id)} onOpen={setViewingApexAlert} />
              ))}
              <p className="text-white text-[10px] text-center pt-1 pb-1">Swipe an item left to dismiss it for a week</p>
            </>
          )}
        </div>
      </section>

      {/* A client's own save (nutrition, workout, weigh-in, habit, check-in)
          can fail silently on their end — the only way a coach used to find
          out was the client screenshotting the generic error toast and
          sending it over. Every one of those failures now also writes a
          lightweight record here, so it shows up on its own instead of
          depending on a client to report it. Only rendered when there's
          something to show — an empty state here would just be noise next
          to "All clients are on track" above. */}
      {db.errorLogs.length > 0 && (
        <DarkPanel className="relative flex flex-col mx-4 md:mx-0 mb-7">
          <div className="relative px-5 pt-5 pb-1 flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border"
              style={{ backgroundColor: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.3)" }}
            >
              <AlertTriangle size={15} style={{ color: OVER_RED }} />
            </div>
            <p className="text-white font-semibold">Client-Side Errors</p>
            <span className="text-white text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: OVER_RED }}>
              {db.errorLogs.length}
            </span>
          </div>
          <div className="relative px-5 pb-3">
            <p className="text-white text-xs mb-2">A save failed on a client's device — they may not have noticed.</p>
            <div className="divide-y" style={{ borderColor: CLIENT_DARK_BORDER }}>
              {db.errorLogs.slice(0, 8).map((e) => {
                const client = clients.find((c) => c.id === e.clientId);
                return (
                  <div key={e.id} className="flex items-start gap-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">
                        {client?.name || "Unknown client"} <span className="text-white/40 font-normal">— {e.action}</span>
                      </p>
                      <p className="text-white/50 text-xs mt-0.5 truncate">{e.message}</p>
                      <p className="text-white/30 text-[11px] mt-0.5">{timeAgo(e.createdAt)}</p>
                    </div>
                    <button
                      onClick={() => dismissErrorLog(e.id)}
                      className="text-white/40 text-xs font-semibold px-2 py-1 rounded-lg shrink-0"
                      style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                    >
                      Dismiss
                    </button>
                  </div>
                );
              })}
            </div>
            {db.errorLogs.length > 8 && (
              <p className="text-white/40 text-[11px] text-center pt-2">+{db.errorLogs.length - 8} more</p>
            )}
          </div>
        </DarkPanel>
      )}

      <section className="relative mx-4 md:mx-0 mb-7">
        <SectionHead title="Recent activity" meta="Your latest client activity" />
        <div className="border-t max-h-[420px] overflow-y-auto" style={{ borderColor: "rgba(255,255,255,0.22)" }}>
          {recentActivity.length === 0 ? (
            <p className="text-white text-sm text-center py-8">Nothing yet — activity from your clients will show up here.</p>
          ) : (
            <div className="md:columns-2 md:gap-x-8">
              {recentActivity.map((item, i) => (
                <ActivityItem
                  key={i}
                  item={item}
                  onClick={() => (item.type === "weighin" ? onOpenClient?.(item.clientId, { tab: "progress" }) : setViewingActivity(item))}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="relative mx-4 md:mx-0 mb-7">
        <CoachNotesCard currentUser={currentUser} updateUser={updateUser} showToast={showToast} />
      </div>

      <section className="relative mx-4 md:mx-0 mb-7">
        <SectionHead title="Segments" meta="What clients need next" />
        <div className="border-t pt-1" style={{ borderColor: "rgba(255,255,255,0.22)" }}>
          <SegmentRow icon={CalendarPlus} label="Need a new training phase" clients={needsNewPhase} onViewAll={() => onNavigate("clients")} />
          <SegmentRow icon={Trophy} label="New exercise personal bests" clients={newPRs} onViewAll={() => onNavigate("clients")} />
          <SegmentRow icon={CalendarClock} label="Phase ending within a week" clients={phaseEndingSoon} onViewAll={() => onNavigate("clients")} />
          <SegmentRow icon={Utensils} label="Meal guide ending in a couple of days" clients={mealPlanEndingSoon} onViewAll={() => onNavigate("clients")} />
          <SegmentRow icon={MessageCircleOff} label="Not messaged in 7+ days" clients={notMessagedLately} onViewAll={() => onNavigate("clients")} />
        </div>
      </section>

      <BottomSheet
        open={!!viewingActivity}
        onClose={() => setViewingActivity(null)}
        title={viewingActivity?.type === "checkin" ? viewingActivity.subject : viewingActivity?.clientName}
        wide
        bodyClassName="p-3 sm:p-5"
      >
        {viewingActivity?.type === "checkin" ? (
          <CheckInReviewCard
            clientId={viewingActivity.clientId}
            clientName={viewingActivity.clientName}
            form={viewingActivity.form}
            response={viewingActivity.response}
            sendMessage={sendMessage}
            markFormResponseRead={markFormResponseRead}
            showToast={showToast}
          />
        ) : (
          viewingActivity && (
            <WorkoutLogCard
              log={viewingActivity.log}
              exercisesById={exercisesById}
              defaultOpen
              allLogs={db.workoutLogs[viewingActivity.clientId] || []}
            />
          )
        )}
      </BottomSheet>

      <ApexInsightSheet
        alert={viewingApexAlert}
        onClose={() => setViewingApexAlert(null)}
        sendMessage={sendMessage}
        showToast={showToast}
        phraseApexSuggestion={phraseApexSuggestion}
        onReviewClient={() => {
          const clientId = viewingApexAlert?.client.id;
          setViewingApexAlert(null);
          if (onOpenClient) onOpenClient(clientId);
          else onNavigate("clients");
        }}
        onDismiss={() => {
          dismissAlert(viewingApexAlert.id);
          setViewingApexAlert(null);
        }}
      />

      {broadcastOpen && (
        <WorkoutEditor
          open
          day={{ label: "Today's Workout", muscleGroups: [], exercises: [] }}
          exercises={db.exercises}
          onClose={() => setBroadcastOpen(false)}
          showToast={showToast}
          onSave={async (built) => {
            try {
              await broadcastWorkout(
                active.map((c) => c.id),
                { date: todayKey, label: built.label, muscleGroups: built.muscleGroups, exercises: built.exercises }
              );
              showToast(`"${built.label}" added to ${active.length} client${active.length === 1 ? "" : "s"}' calendars for today`);
            } catch (err) {
              showToast(err.message || "Couldn't broadcast that workout");
            }
            setBroadcastOpen(false);
          }}
        />
      )}
    </DarkPage>
  );
}
