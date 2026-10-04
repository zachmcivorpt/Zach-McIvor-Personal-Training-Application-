import React, { useState, useMemo, useEffect, useRef } from "react";
import { useApp, getCurrentPhase } from "../lib/AppContext";
import { localDateKey } from "../lib/dateKey";
import { Pill, Avatar, BottomSheet, Logo } from "../components/ui";
import { WorkoutLogCard } from "./CoachClientDetail";
import WorkoutEditor from "./WorkoutEditor";
import { clientStatusPill } from "./CoachClients";
import { resolveNutritionTargets } from "../lib/nutritionTargets";
import { computeApexInsights } from "../lib/apexInsights";
import { MEASURE_BLUE, CLIENT_DARK_SURFACE, CLIENT_DARK_SURFACE_2, CLIENT_DARK_BORDER, GOAL_GREEN, OVER_RED } from "../theme";
import { DarkPage, DarkPanel, StatCard, MountainTexture } from "./darkUI";
import {
  Users,
  UserPlus,
  FilePlus,
  Video,
  CalendarPlus,
  CalendarClock,
  Trophy,
  MessageCircleOff,
  NotebookPen,
  MessageCircle,
  Send,
  Check,
  StickyNote,
  Flame,
  Utensils,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Trash2,
  Sparkles,
  Bell,
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
        style={{ transform: `translateX(${dragX}px)`, transition: dragging ? "none" : "transform 200ms ease", backgroundColor: CLIENT_DARK_SURFACE }}
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
  const clickable = (item.type === "workout" && !!item.log) || (item.type === "checkin" && !!item.response);
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
    <DarkPanel className="p-5">
      <div className="relative flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border" style={{ backgroundColor: "rgba(47,143,255,0.12)", borderColor: "rgba(47,143,255,0.25)" }}>
            <StickyNote size={15} style={{ color: MEASURE_BLUE }} />
          </div>
          <p className="text-white font-semibold">Coach's Notes</p>
        </div>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="text-xs font-bold text-black bg-white px-3 py-1.5 rounded-lg disabled:opacity-30 transition-opacity"
        >
          {saving ? "SAVING…" : "SAVE"}
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
        className="relative w-full border rounded-xl px-3.5 py-3 text-sm text-white outline-none placeholder:text-white resize-none"
        style={{ backgroundColor: CLIENT_DARK_SURFACE_2, borderColor: CLIENT_DARK_BORDER }}
      />
    </DarkPanel>
  );
}

export default function CoachDashboard({ onNavigate, onOpenClient, onOpenLibrary, showToast }) {
  const { db, sendMessage, markFormResponseRead, currentUser, updateUser, broadcastWorkout, phraseApexSuggestion } = useApp();
  const clients = db.users.filter((u) => u.role === "client");
  const active = clients.filter((c) => c.status === "active");
  const todayKey = localDateKey();
  const newActiveThisWeek = active.filter((c) => c.createdAt && Date.now() - c.createdAt <= 7 * 86400000).length;
  const unreadNotifCount = (db.notifications || []).filter((n) => !n.read).length;
  const coachNameParts = (currentUser?.name || "").trim().split(/\s+/).filter(Boolean);
  const coachInitials = coachNameParts.length > 1
    ? `${coachNameParts[0][0]}${coachNameParts[coachNameParts.length - 1][0]}`.toUpperCase()
    : (coachNameParts[0]?.[0] || "?").toUpperCase();
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
    if (mealPlanDays !== null && mealPlanDays <= 2) {
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
  const activity = [];
  active.forEach((c) => {
    const logs = db.workoutLogs[c.id] || [];
    logs.slice(0, 5).forEach((log) => {
      if (log.cardio) {
        const details = [
          log.cardio.durationMin ? `${log.cardio.durationMin} min` : null,
          log.cardio.distanceKm ? `${log.cardio.distanceKm} km` : null,
          log.cardio.caloriesBurned ? `${log.cardio.caloriesBurned} kcal` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        activity.push({
          type: "cardio",
          date: log.date,
          clientName: c.name,
          clientAvatar: c.avatarUrl,
          verb: "logged",
          subject: log.cardio.activityLabel,
          suffix: details ? ` (${details}).` : ".",
        });
        return;
      }
      const prCount = log.entries.reduce((a, e) => a + e.sets.filter((s) => s.isPR).length, 0);
      activity.push({
        type: "workout",
        date: log.date,
        clientName: c.name,
        clientAvatar: c.avatarUrl,
        verb: "completed",
        subject: log.dayLabel,
        suffix: prCount > 0 ? ` and set ${prCount} new personal best${prCount === 1 ? "" : "s"}.` : ".",
        log,
      });
    });
    const thread = db.messages[c.id] || [];
    thread
      .filter((m) => m.from === "client")
      .slice(-3)
      .forEach((m) => {
        activity.push({
          date: m.date,
          clientName: c.name,
          clientAvatar: c.avatarUrl,
          verb: "sent a message",
          subject: "",
          suffix: `: "${m.text.length > 40 ? m.text.slice(0, 40) + "…" : m.text}"`,
        });
      });
    const responses = (db.formResponses || {})[c.id] || [];
    responses.slice(0, 5).forEach((r) => {
      const form = (db.forms || []).find((f) => f.id === r.formId);
      activity.push({
        type: "checkin",
        date: r.date,
        clientName: c.name,
        clientAvatar: c.avatarUrl,
        clientId: c.id,
        verb: "submitted",
        subject: form?.name || "a check-in",
        suffix: ".",
        response: r,
        form,
      });
    });
    // Nutrition goal hits — derived live from logged totals vs. the
    // client's own targets, same as everything else in this feed, rather
    // than a separately-tracked notification doc.
    const targets = resolveNutritionTargets(c.nutritionTargets);
    const nutritionDays = (db.nutritionLogs[c.id] || []).slice(-5);
    nutritionDays.forEach((n) => {
      const dateMs = new Date(`${n.date}T12:00:00`).getTime();
      if (Number.isNaN(dateMs)) return;
      if (targets.calories > 0 && (n.calories || 0) >= targets.calories) {
        activity.push({
          type: "nutrition_calories",
          date: dateMs,
          clientName: c.name,
          clientAvatar: c.avatarUrl,
          verb: "hit",
          subject: "their daily calorie goal",
          suffix: ` (${Math.round(n.calories)} / ${targets.calories} kcal).`,
        });
      }
      if (targets.protein > 0 && (n.protein || 0) >= targets.protein) {
        activity.push({
          type: "nutrition_protein",
          date: dateMs,
          clientName: c.name,
          clientAvatar: c.avatarUrl,
          verb: "hit",
          subject: "their protein goal",
          suffix: ` (${Math.round(n.protein)}g / ${targets.protein}g).`,
        });
      }
    });
  });
  activity.sort((a, b) => b.date - a.date);
  const recentActivity = activity.slice(0, 12);

  return (
    <DarkPage padded={false}>
      {/* Hero header — a dark glass panel with a faint layered mountain
          silhouette (plain CSS triangles, not a photo — "atmospheric, not
          a giant photograph") washed into the right edge. */}
      <div className="relative overflow-hidden rounded-2xl mb-4 border" style={{ backgroundColor: CLIENT_DARK_SURFACE, borderColor: CLIENT_DARK_BORDER }}>
        <MountainTexture />
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${MEASURE_BLUE}, transparent)` }} />
        <div className="relative flex items-center justify-between gap-3 px-5 py-6 sm:px-7 sm:py-7">
          <div className="flex items-center gap-4 min-w-0">
            <Logo variant="mark" tone="white" className="h-10 w-auto shrink-0 hidden sm:block" />
            <div className="w-px self-stretch shrink-0 hidden sm:block" style={{ backgroundColor: "rgba(255,255,255,0.14)" }} />
            <div className="min-w-0">
              <h1 className="text-white text-xl sm:text-[28px] font-bold leading-tight truncate">
                {timeOfDayGreeting()}, {currentUser?.name?.split(" ")[0] || "Coach"}
              </h1>
              <p className="text-white text-[11px] sm:text-xs font-semibold tracking-[0.1em] uppercase mt-1.5">Your roster and what needs your attention.</p>
            </div>
          </div>
          <div className="flex items-center gap-3.5 shrink-0">
            <span className="text-white text-xs font-medium tabular-nums hidden sm:inline">
              {new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
            </span>
            <div className="relative text-white">
              <Bell size={18} />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-[7px] h-[7px] rounded-full border" style={{ backgroundColor: OVER_RED, borderColor: CLIENT_DARK_SURFACE }} />
              )}
            </div>
            <div
              className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
              style={{ width: 34, height: 34, fontSize: 12, backgroundColor: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              {coachInitials}
            </div>
          </div>
        </div>
      </div>

      {/* Primary stats — four individually chamfered instrument tiles
          instead of one divided panel, each with its own trend/status
          line (see StatCard above). */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard
          icon={Users}
          label="Active Clients"
          value={active.length}
          trend={newActiveThisWeek > 0 ? `+${newActiveThisWeek}` : "—"}
          trendKind={newActiveThisWeek > 0 ? "up" : "neutral"}
          onClick={() => onNavigate("clients")}
        />
        <StatCard icon={Trophy} label="Challenges" value={(db.challenges || []).length} trend="—" trendKind="neutral" onClick={() => onNavigate("challenges")} />
        <StatCard
          icon={NotebookPen}
          label="Check-ins to Review"
          value={pendingCheckins}
          trend={pendingCheckins > 0 ? "Review now" : "—"}
          trendKind={pendingCheckins > 0 ? "link" : "neutral"}
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
        <StatCard
          icon={MessageCircle}
          label="Messages to Reply"
          value={awaitingReply}
          trend={awaitingReply > 0 ? `${awaitingReply} new` : "—"}
          trendKind={awaitingReply > 0 ? "alert" : "neutral"}
          onClick={() => onNavigate("messages")}
        />
      </div>

      <DarkPanel className="flex flex-col mb-4">
        <div className="relative px-5 pt-5 pb-1 flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border"
            style={
              visibleNeedsAttention.length > 0
                ? { backgroundColor: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.3)" }
                : { backgroundColor: "rgba(34,197,94,0.1)", borderColor: "rgba(34,197,94,0.25)" }
            }
          >
            {visibleNeedsAttention.length > 0 ? (
              <AlertTriangle size={15} style={{ color: OVER_RED }} />
            ) : (
              <CheckCircle2 size={15} style={{ color: GOAL_GREEN }} />
            )}
          </div>
          <p className="text-white font-semibold">Needs Attention</p>
          {visibleNeedsAttention.length > 0 && (
            <span className="text-white text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: OVER_RED }}>
              {visibleNeedsAttention.length}
            </span>
          )}
        </div>
        <div className="relative px-5 pb-2">
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
      </DarkPanel>

      <DarkPanel className="flex flex-col mb-4">
        <div className="relative px-5 pt-5 pb-3">
          <p className="text-white font-semibold">Recent Activity</p>
          <p className="text-white text-xs mt-0.5">Your latest client activity.</p>
        </div>
        <div className="relative px-5 pb-2 max-h-[420px] overflow-y-auto">
          {recentActivity.length === 0 ? (
            <p className="text-white text-sm text-center py-8">Nothing yet — activity from your clients will show up here.</p>
          ) : (
            <div className="md:columns-2 md:gap-x-8">
              {recentActivity.map((item, i) => (
                <ActivityItem key={i} item={item} onClick={() => setViewingActivity(item)} />
              ))}
            </div>
          )}
        </div>
      </DarkPanel>

      <DarkPanel className="flex flex-col mb-4">
        <div className="relative px-5 pt-5 pb-1">
          <p className="text-white font-semibold">Auto-Tagged Segments</p>
          <p className="text-white text-xs mt-0.5">Clients grouped by what they need from you next.</p>
        </div>
        <div className="relative px-5 pb-2 mt-2">
          <SegmentRow icon={CalendarPlus} label="Need a new training phase" clients={needsNewPhase} onViewAll={() => onNavigate("clients")} />
          <SegmentRow icon={Trophy} label="New exercise personal bests" clients={newPRs} onViewAll={() => onNavigate("clients")} />
          <SegmentRow icon={CalendarClock} label="Phase ending within a week" clients={phaseEndingSoon} onViewAll={() => onNavigate("clients")} />
          <SegmentRow icon={Utensils} label="Meal guide ending in a couple of days" clients={mealPlanEndingSoon} onViewAll={() => onNavigate("clients")} />
          <SegmentRow icon={MessageCircleOff} label="Not messaged in 7+ days" clients={notMessagedLately} onViewAll={() => onNavigate("clients")} />
        </div>
      </DarkPanel>

      <div className="mb-4">
        <CoachNotesCard currentUser={currentUser} updateUser={updateUser} showToast={showToast} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DarkPanel className="md:col-span-1 h-fit p-5">
          <p className="relative text-white font-semibold mb-3">Quick Actions</p>
          <div className="relative space-y-2">
            <button
              onClick={() => onNavigate("clients")}
              className="w-full flex items-center gap-3 border rounded-xl px-4 py-3 transition-colors hover:bg-white/[0.06]"
              style={{ backgroundColor: "rgba(255,255,255,0.03)", borderColor: CLIENT_DARK_BORDER }}
            >
              <UserPlus size={16} className="text-white" />
              <span className="text-white text-sm font-medium flex-1 text-left">Add a new client</span>
            </button>
            <button
              onClick={() => onOpenLibrary("programs")}
              className="w-full flex items-center gap-3 border rounded-xl px-4 py-3 transition-colors hover:bg-white/[0.06]"
              style={{ backgroundColor: "rgba(255,255,255,0.03)", borderColor: CLIENT_DARK_BORDER }}
            >
              <FilePlus size={16} className="text-white" />
              <span className="text-white text-sm font-medium flex-1 text-left">Build a program template</span>
            </button>
            <button
              onClick={() => onNavigate("library")}
              className="w-full flex items-center gap-3 border rounded-xl px-4 py-3 transition-colors hover:bg-white/[0.06]"
              style={{ backgroundColor: "rgba(255,255,255,0.03)", borderColor: CLIENT_DARK_BORDER }}
            >
              <Video size={16} className="text-white" />
              <span className="text-white text-sm font-medium flex-1 text-left">Add an exercise + video</span>
            </button>
            <button
              onClick={() => setBroadcastOpen(true)}
              disabled={active.length === 0}
              title={active.length === 0 ? "No active clients to broadcast to yet" : undefined}
              className="w-full flex items-center gap-3 border rounded-xl px-4 py-3 transition-colors hover:bg-white/[0.06] disabled:opacity-40 disabled:hover:bg-transparent"
              style={{ backgroundColor: "rgba(255,255,255,0.03)", borderColor: CLIENT_DARK_BORDER }}
            >
              <Flame size={16} className="text-white" />
              <span className="text-white text-sm font-medium flex-1 text-left">Broadcast today's workout</span>
            </button>
          </div>
        </DarkPanel>

        <DarkPanel className="md:col-span-2 h-fit p-5">
          <p className="relative text-white font-semibold mb-3">Clients</p>
          <div className="relative space-y-2.5">
            {clients.length === 0 && <p className="text-white text-sm">No clients yet.</p>}
            {clients.slice(0, 8).map((c) => {
              const phases = (db.clientPhases || {})[c.id] || [];
              const phase = getCurrentPhase(phases, todayKey);
              return (
                <div key={c.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={c.name} url={c.avatarUrl} size={32} dark />
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium leading-none truncate">{c.name}</p>
                      <p className="text-white text-xs mt-1 truncate">{phase ? phase.name : "No phase scheduled"}</p>
                    </div>
                  </div>
                  <Pill tone={clientStatusPill(c).tone} dark>
                    {clientStatusPill(c).label}
                  </Pill>
                </div>
              );
            })}
          </div>
        </DarkPanel>
      </div>

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
