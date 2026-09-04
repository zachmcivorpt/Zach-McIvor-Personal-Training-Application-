import React from "react";
import { useApp, getCurrentPhase } from "../lib/AppContext";
import { Card, Pill, Avatar } from "../components/ui";
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
} from "lucide-react";

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

function ActivityItem({ item }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-black/5 last:border-0">
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
        <p className="text-black/30 text-[11px] mt-1">{timeAgo(item.date)}</p>
      </div>
    </div>
  );
}

export default function CoachDashboard({ onNavigate }) {
  const { db } = useApp();
  const clients = db.users.filter((u) => u.role === "client");
  const active = clients.filter((c) => c.status === "active");
  const todayKey = new Date().toISOString().slice(0, 10);

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

  const awaitingReply = active.filter((c) => {
    const thread = db.messages[c.id] || [];
    const last = thread[thread.length - 1];
    return last && last.from === "client";
  }).length;

  const pendingCheckins = active.reduce((a, c) => a + ((db.formResponses || {})[c.id] || []).filter((r) => r.read === false).length, 0);

  // ---- recent activity feed, merged across every active client ----
  const activity = [];
  active.forEach((c) => {
    const logs = db.workoutLogs[c.id] || [];
    logs.slice(0, 5).forEach((log) => {
      const prCount = log.entries.reduce((a, e) => a + e.sets.filter((s) => s.isPR).length, 0);
      activity.push({
        date: log.date,
        clientName: c.name,
        clientAvatar: c.avatarUrl,
        verb: "completed",
        subject: log.dayLabel,
        suffix: prCount > 0 ? ` and set ${prCount} new personal best${prCount === 1 ? "" : "s"}.` : ".",
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
        date: r.date,
        clientName: c.name,
        clientAvatar: c.avatarUrl,
        verb: "submitted",
        subject: form?.name || "a check-in",
        suffix: ".",
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
        <StatCard icon={NotebookPen} label="CHECK-INS TO REVIEW" value={pendingCheckins} onClick={() => onNavigate("clients")} />
        <StatCard icon={MessageCircle} label="MESSAGES TO REPLY TO" value={awaitingReply} onClick={() => onNavigate("messages")} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 items-stretch">
        <Card className="lg:col-span-2 !p-0 overflow-hidden flex flex-col">
          <div className="px-5 pt-5 pb-1">
            <p className="text-black font-semibold">We've auto-tagged your clients based on their needs</p>
          </div>
          <div className="px-5 pb-2">
            <SegmentRow icon={CalendarPlus} label="Need a new training phase" clients={needsNewPhase} onViewAll={() => onNavigate("clients")} />
            <SegmentRow icon={Trophy} label="New exercise personal bests" clients={newPRs} onViewAll={() => onNavigate("clients")} />
            <SegmentRow icon={CalendarClock} label="Phase ending within a week" clients={phaseEndingSoon} onViewAll={() => onNavigate("clients")} />
            <SegmentRow icon={MessageCircleOff} label="Not messaged in 7+ days" clients={notMessagedLately} onViewAll={() => onNavigate("clients")} />
          </div>
        </Card>

        <Card className="lg:col-span-1 !p-0 overflow-hidden flex flex-col">
          <div className="px-5 pt-5 pb-3">
            <p className="text-black font-semibold">Recent Activity</p>
          </div>
          <div className="px-5 pb-2 flex-1 max-h-[340px] overflow-y-auto">
            {recentActivity.length === 0 ? (
              <p className="text-black/30 text-sm text-center py-8">Nothing yet — activity from your clients will show up here.</p>
            ) : (
              recentActivity.map((item, i) => <ActivityItem key={i} item={item} />)
            )}
          </div>
        </Card>
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
                  <Pill tone={c.status === "active" ? "outline" : "muted"}>{c.status === "active" ? "Active" : "Not sent yet"}</Pill>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
