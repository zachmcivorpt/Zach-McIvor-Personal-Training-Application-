import React, { useState, useMemo, useEffect, useRef } from "react";
import { useApp, getCurrentPhase } from "../lib/AppContext";
import { localDateKey } from "../lib/dateKey";
import { Card, Pill, Avatar, BottomSheet } from "../components/ui";
import { WorkoutLogCard } from "./CoachClientDetail";
import WorkoutEditor from "./WorkoutEditor";
import { clientStatusPill } from "./CoachClients";
import { MEASURE_BLUE } from "../theme";
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
} from "lucide-react";

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
            className="flex-1 bg-black/5 rounded-full px-4 py-2.5 text-sm text-black outline-none placeholder:text-black/30"
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

function StatCard({ icon: Icon, label, value, onClick }) {
  return (
    <Card className="!p-5" onClick={onClick}>
      <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center mb-3">
        <Icon size={16} className="text-blue-500" />
      </div>
      <p className="text-black text-3xl font-bold leading-none">{value}</p>
      <p className="text-black/40 text-[11px] tracking-wide mt-2">{label}</p>
    </Card>
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

function AvatarStack({ clients, max = 4 }) {
  const shown = clients.slice(0, max);
  const extra = clients.length - shown.length;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((c) => (
        <div key={c.id} className="ring-2 ring-white rounded-full">
          <Avatar name={c.name} url={c.avatarUrl} size={30} />
        </div>
      ))}
      {extra > 0 && (
        <div className="w-[30px] h-[30px] rounded-full bg-black/8 ring-2 ring-white flex items-center justify-center text-black/50 text-[11px] font-semibold">
          +{extra}
        </div>
      )}
    </div>
  );
}

function SegmentRow({ icon: Icon, label, clients, onViewAll }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-black/5 last:border-0">
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
          clients.length ? "bg-blue-50 border border-blue-100" : "bg-black/[0.03] border border-black/8"
        }`}
      >
        <Icon size={16} className={clients.length ? "text-blue-500" : "text-black/25"} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-black/70 text-sm font-medium truncate">{label}</p>
      </div>
      {clients.length > 0 ? (
        <div className="flex items-center gap-2.5 shrink-0">
          <AvatarStack clients={clients} />
          <button onClick={onViewAll} className="text-xs font-semibold shrink-0 text-blue-600 hover:text-blue-700">
            View All
          </button>
        </div>
      ) : (
        <span className="text-black/25 text-xs shrink-0">All clear</span>
      )}
    </div>
  );
}

const NEEDS_ATTENTION_ICONS = { quiet: AlertTriangle, missed: CalendarClock, insight: TrendingUp };

function NeedsAttentionRow({ alert }) {
  const Icon = alert.kind === "insight" && alert.direction === "down" ? TrendingDown : NEEDS_ATTENTION_ICONS[alert.kind];
  return (
    <div className="flex items-center gap-3 py-3 border-b border-black/5 last:border-0">
      <Avatar name={alert.client.name} url={alert.client.avatarUrl} size={32} />
      <div className="flex-1 min-w-0">
        <p className="text-black/80 text-[13px] leading-snug">
          <span className="font-semibold text-black">{alert.client.name}</span> — {alert.title}
        </p>
        <p className="text-black/40 text-[11px] mt-0.5">{alert.detail}</p>
      </div>
      <Icon size={16} className="text-amber-500 shrink-0" />
    </div>
  );
}

function ActivityItem({ item, onClick }) {
  const clickable = (item.type === "workout" && !!item.log) || (item.type === "checkin" && !!item.response);
  return (
    <div
      onClick={clickable ? onClick : undefined}
      className={`flex items-start gap-3 py-3 border-b border-black/5 last:border-0 ${clickable ? "cursor-pointer hover:bg-black/[0.03] -mx-1 px-1 rounded-lg" : ""}`}
    >
      <Avatar name={item.clientName} url={item.clientAvatar} size={32} />
      <div className="flex-1 min-w-0">
        <p className="text-black/80 text-[13px] leading-snug">
          <span className="font-semibold text-black">{item.clientName}</span> {item.verb}{" "}
          {item.subject && (
            <span className="font-medium" style={{ color: MEASURE_BLUE }}>
              {item.subject}
            </span>
          )}
          {item.suffix}
        </p>
        <p className="text-black/30 text-[11px] mt-1">
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
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
            <StickyNote size={15} className="text-blue-500" />
          </div>
          <p className="text-black font-semibold">Coach's Notes</p>
        </div>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="text-xs font-bold text-white bg-black px-3 py-1.5 rounded-lg disabled:opacity-30 transition-opacity"
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
        className="w-full bg-black/[0.03] border border-black/10 rounded-xl px-3.5 py-3 text-sm text-black outline-none placeholder:text-black/30 resize-none"
      />
    </Card>
  );
}

export default function CoachDashboard({ onNavigate, showToast }) {
  const { db, sendMessage, markFormResponseRead, currentUser, updateUser, broadcastWorkout } = useApp();
  const clients = db.users.filter((u) => u.role === "client");
  const active = clients.filter((c) => c.status === "active");
  const todayKey = localDateKey();
  const [viewingActivity, setViewingActivity] = useState(null); // the clicked Recent Activity item (workout or check-in) for the detail sheet
  const [broadcastOpen, setBroadcastOpen] = useState(false);
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

  // A meal plan's last day = startDate + (weeksCount * 7 - 1) days.
  // Flagged once there are 2 or fewer days left, so a coach can duplicate
  // the current week (or build a fresh one) before the client runs out.
  const mealPlanEndingSoon = active.filter((c) => {
    const plan = (db.mealPlans[c.id] || [])[0];
    if (!plan?.startDate || !plan.days?.length) return false;
    const weeksCount = Math.max(...plan.days.map((d, i) => d.weekIndex ?? Math.floor(i / 7))) + 1;
    const endDateKey = addDaysISO(plan.startDate, weeksCount * 7 - 1);
    const days = daysUntil(endDateKey, todayKey);
    return days >= 0 && days <= 2;
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
  const KIND_PRIORITY = { quiet: 0, missed: 1, insight: 2 };
  const needsAttention = [];
  active.forEach((c) => {
    const logs = db.workoutLogs[c.id] || [];
    const daysSinceWorkout = logs[0] ? Math.floor((Date.now() - logs[0].date) / 86400000) : null;
    const daysSinceLogin = c.lastLoginAt ? Math.floor((Date.now() - c.lastLoginAt) / 86400000) : null;

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

  const awaitingReply = active.filter((c) => {
    const thread = db.messages[c.id] || [];
    const last = thread[thread.length - 1];
    return last && last.from === "client";
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
  });
  activity.sort((a, b) => b.date - a.date);
  const recentActivity = activity.slice(0, 12);

  return (
    <div className="max-w-7xl mx-auto px-4 py-5 md:px-8 md:py-8">
      <div className="mb-6">
        <h1 className="text-black text-2xl font-bold">Overview</h1>
        <p className="text-black/40 text-sm mt-0.5">Your roster and what needs your attention.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard icon={Users} label="ACTIVE CLIENTS" value={active.length} onClick={() => onNavigate("clients")} />
        <StatCard icon={Trophy} label="CHALLENGES" value={(db.challenges || []).length} onClick={() => onNavigate("challenges")} />
        <StatCard
          icon={NotebookPen}
          label="CHECK-INS TO REVIEW"
          value={pendingCheckins}
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
        <StatCard icon={MessageCircle} label="MESSAGES TO REPLY TO" value={awaitingReply} onClick={() => onNavigate("messages")} />
      </div>

      <Card className="!p-0 overflow-hidden flex flex-col mb-4">
        <div className="px-5 pt-5 pb-1 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle size={15} className="text-amber-500" />
          </div>
          <p className="text-black font-semibold">Needs Attention</p>
          {needsAttention.length > 0 && (
            <span className="bg-amber-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">{needsAttention.length}</span>
          )}
        </div>
        <div className="px-5 pb-2">
          {needsAttention.length === 0 ? (
            <p className="text-black/30 text-sm text-center py-6">All clients are on track — nothing needs your attention right now.</p>
          ) : (
            needsAttention.slice(0, 8).map((a) => <NeedsAttentionRow key={a.id} alert={a} />)
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 items-stretch">
        <Card className="lg:col-span-1 !p-0 overflow-hidden flex flex-col">
          <div className="px-5 pt-5 pb-3">
            <p className="text-black font-semibold">Recent Activity</p>
          </div>
          <div className="px-5 pb-2 flex-1 max-h-[340px] overflow-y-auto">
            {recentActivity.length === 0 ? (
              <p className="text-black/30 text-sm text-center py-8">Nothing yet — activity from your clients will show up here.</p>
            ) : (
              recentActivity.map((item, i) => (
                <ActivityItem
                  key={i}
                  item={item}
                  onClick={() => setViewingActivity(item)}
                />
              ))
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2 !p-0 overflow-hidden flex flex-col">
          <div className="px-5 pt-5 pb-1">
            <p className="text-black font-semibold">We've auto-tagged your clients based on their needs</p>
          </div>
          <div className="px-5 pb-2">
            <SegmentRow icon={CalendarPlus} label="Need a new training phase" clients={needsNewPhase} onViewAll={() => onNavigate("clients")} />
            <SegmentRow icon={Trophy} label="New exercise personal bests" clients={newPRs} onViewAll={() => onNavigate("clients")} />
            <SegmentRow icon={CalendarClock} label="Phase ending within a week" clients={phaseEndingSoon} onViewAll={() => onNavigate("clients")} />
            <SegmentRow icon={Utensils} label="Meal plan ending in a couple of days" clients={mealPlanEndingSoon} onViewAll={() => onNavigate("clients")} />
            <SegmentRow icon={MessageCircleOff} label="Not messaged in 7+ days" clients={notMessagedLately} onViewAll={() => onNavigate("clients")} />
          </div>
        </Card>
      </div>

      <div className="mb-4">
        <CoachNotesCard currentUser={currentUser} updateUser={updateUser} showToast={showToast} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-1 h-fit">
          <p className="text-black font-semibold mb-3">Quick actions</p>
          <div className="space-y-2">
            <button onClick={() => onNavigate("clients")} className="w-full flex items-center gap-3 bg-black/5 hover:bg-black/8 rounded-xl px-4 py-3 transition-colors">
              <UserPlus size={16} className="text-black/60" />
              <span className="text-black/80 text-sm font-medium flex-1 text-left">Add a new client</span>
            </button>
            <button onClick={() => onNavigate("programs")} className="w-full flex items-center gap-3 bg-black/5 hover:bg-black/8 rounded-xl px-4 py-3 transition-colors">
              <FilePlus size={16} className="text-black/60" />
              <span className="text-black/80 text-sm font-medium flex-1 text-left">Build a program template</span>
            </button>
            <button onClick={() => onNavigate("library")} className="w-full flex items-center gap-3 bg-black/5 hover:bg-black/8 rounded-xl px-4 py-3 transition-colors">
              <Video size={16} className="text-black/60" />
              <span className="text-black/80 text-sm font-medium flex-1 text-left">Add an exercise + video</span>
            </button>
            <button
              onClick={() => setBroadcastOpen(true)}
              disabled={active.length === 0}
              title={active.length === 0 ? "No active clients to broadcast to yet" : undefined}
              className="w-full flex items-center gap-3 bg-black/5 hover:bg-black/8 disabled:opacity-40 disabled:hover:bg-black/5 rounded-xl px-4 py-3 transition-colors"
            >
              <Flame size={16} className="text-black/60" />
              <span className="text-black/80 text-sm font-medium flex-1 text-left">Broadcast today's workout</span>
            </button>
          </div>
        </Card>

        <Card className="md:col-span-2 h-fit">
          <p className="text-black font-semibold mb-3">Clients</p>
          <div className="space-y-2.5">
            {clients.length === 0 && <p className="text-black/30 text-sm">No clients yet.</p>}
            {clients.slice(0, 8).map((c) => {
              const phases = (db.clientPhases || {})[c.id] || [];
              const phase = getCurrentPhase(phases, todayKey);
              return (
                <div key={c.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={c.name} url={c.avatarUrl} size={32} />
                    <div className="min-w-0">
                      <p className="text-black text-sm font-medium leading-none truncate">{c.name}</p>
                      <p className="text-black/35 text-xs mt-1 truncate">{phase ? phase.name : "No phase scheduled"}</p>
                    </div>
                  </div>
                  <Pill tone={clientStatusPill(c).tone}>{clientStatusPill(c).label}</Pill>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <BottomSheet
        open={!!viewingActivity}
        onClose={() => setViewingActivity(null)}
        title={viewingActivity?.type === "checkin" ? viewingActivity.subject : viewingActivity?.clientName}
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
          viewingActivity && <WorkoutLogCard log={viewingActivity.log} exercisesById={exercisesById} defaultOpen />
        )}
      </BottomSheet>

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
    </div>
  );
}
