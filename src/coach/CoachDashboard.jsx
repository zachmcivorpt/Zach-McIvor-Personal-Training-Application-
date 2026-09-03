import React from "react";
import { useApp, flattenSessions } from "../lib/AppContext";
import { Card, Pill } from "../components/ui";
import { Users, ClipboardList, Dumbbell, UserPlus, FilePlus, Video, Mail } from "lucide-react";

function StatCard({ icon: Icon, label, value, onClick }) {
  return (
    <Card className="!p-4" onClick={onClick}>
      <Icon size={18} className="text-white/40 mb-3" />
      <p className="text-white text-2xl font-bold leading-none">{value}</p>
      <p className="text-white/40 text-[11px] tracking-wide mt-1.5">{label}</p>
    </Card>
  );
}

export default function CoachDashboard({ onNavigate }) {
  const { db } = useApp();
  const clients = db.users.filter((u) => u.role === "client");
  const active = clients.filter((c) => c.status === "active");
  const invited = clients.filter((c) => c.status === "invited");

  return (
    <div className="px-5 pb-6 space-y-4">
      <div>
        <h1 className="text-white text-2xl font-bold">Overview</h1>
        <p className="text-white/40 text-sm mt-0.5">Your roster, programs, and content at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Users} label="ACTIVE CLIENTS" value={active.length} onClick={() => onNavigate("clients")} />
        <StatCard icon={Mail} label="NOT SENT YET" value={invited.length} onClick={() => onNavigate("clients")} />
        <StatCard icon={ClipboardList} label="PROGRAMS" value={db.programs.length} onClick={() => onNavigate("programs")} />
        <StatCard icon={Dumbbell} label="EXERCISES" value={db.exercises.length} onClick={() => onNavigate("exercises")} />
      </div>

      <Card>
        <p className="text-white font-semibold mb-3">Quick actions</p>
        <div className="space-y-2">
          <button onClick={() => onNavigate("clients")} className="w-full flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
            <UserPlus size={16} className="text-white/60" />
            <span className="text-white/80 text-sm font-medium flex-1 text-left">Add a new client</span>
          </button>
          <button onClick={() => onNavigate("programs")} className="w-full flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
            <FilePlus size={16} className="text-white/60" />
            <span className="text-white/80 text-sm font-medium flex-1 text-left">Build a new program</span>
          </button>
          <button onClick={() => onNavigate("exercises")} className="w-full flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
            <Video size={16} className="text-white/60" />
            <span className="text-white/80 text-sm font-medium flex-1 text-left">Add an exercise + video</span>
          </button>
        </div>
      </Card>

      <Card>
        <p className="text-white font-semibold mb-3">Clients</p>
        <div className="space-y-2.5">
          {clients.length === 0 && <p className="text-white/30 text-sm">No clients yet.</p>}
          {clients.slice(0, 6).map((c) => {
            const program = db.programs.find((p) => p.id === c.assignedProgramId);
            return (
              <div key={c.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white">
                    {c.name[0]}
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium leading-none">{c.name}</p>
                    <p className="text-white/35 text-xs mt-1">{program ? program.name : "No program assigned"}</p>
                  </div>
                </div>
                <Pill tone={c.status === "active" ? "outline" : "muted"}>{c.status === "active" ? "Active" : "Not sent yet"}</Pill>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
