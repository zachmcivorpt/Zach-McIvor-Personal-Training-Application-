import React from "react";
import { useApp, getCurrentPhase } from "../lib/AppContext";
import { Card, Pill, Avatar } from "../components/ui";
import { Users, ClipboardList, Dumbbell, UserPlus, FilePlus, Video, Mail } from "lucide-react";

function StatCard({ icon: Icon, label, value, onClick }) {
  return (
    <Card className="!p-5" onClick={onClick}>
      <Icon size={18} className="text-black/40 mb-3" />
      <p className="text-black text-3xl font-bold leading-none">{value}</p>
      <p className="text-black/40 text-[11px] tracking-wide mt-2">{label}</p>
    </Card>
  );
}

export default function CoachDashboard({ onNavigate }) {
  const { db } = useApp();
  const clients = db.users.filter((u) => u.role === "client");
  const active = clients.filter((c) => c.status === "active");
  const invited = clients.filter((c) => c.status === "invited");
  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-6xl mx-auto px-8 py-8">
      <div className="mb-6">
        <h1 className="text-black text-2xl font-bold">Overview</h1>
        <p className="text-black/40 text-sm mt-0.5">Your roster, programs, and content at a glance.</p>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard icon={Users} label="ACTIVE CLIENTS" value={active.length} onClick={() => onNavigate("clients")} />
        <StatCard icon={Mail} label="NOT SENT YET" value={invited.length} onClick={() => onNavigate("clients")} />
        <StatCard icon={ClipboardList} label="PROGRAM TEMPLATES" value={db.programs.length} onClick={() => onNavigate("programs")} />
        <StatCard icon={Dumbbell} label="EXERCISES" value={db.exercises.length} onClick={() => onNavigate("exercises")} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-1 h-fit">
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
            <button onClick={() => onNavigate("exercises")} className="w-full flex items-center gap-3 bg-black/5 hover:bg-black/8 rounded-xl px-4 py-3 transition-colors">
              <Video size={16} className="text-black/60" />
              <span className="text-black/80 text-sm font-medium flex-1 text-left">Add an exercise + video</span>
            </button>
          </div>
        </Card>

        <Card className="col-span-2 h-fit">
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
