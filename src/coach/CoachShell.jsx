import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../lib/AppContext";
import { Logo, Toast } from "../components/ui";
import { LayoutDashboard, Users, ClipboardList, Dumbbell, Settings, LogOut } from "lucide-react";
import CoachDashboard from "./CoachDashboard";
import CoachClients from "./CoachClients";
import CoachPrograms from "./CoachPrograms";
import CoachExercises from "./CoachExercises";
import CoachSettings from "./CoachSettings";

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "clients", label: "Clients", icon: Users },
  { id: "programs", label: "Programs", icon: ClipboardList },
  { id: "exercises", label: "Exercises", icon: Dumbbell },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function CoachShell() {
  const { currentUser, logout } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState("dashboard");
  const [toast, setToast] = useState({ show: false, message: "" });

  function showToast(message) {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: "" }), 1800);
  }

  function doLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="w-full h-full min-h-screen bg-[#0A0A0B] font-sans flex justify-center">
      <div className="w-full max-w-md relative pb-24">
        <div className="flex items-center justify-between px-5 pt-6 pb-2">
          <div className="flex items-center gap-2.5">
            <Logo variant="mark" tone="white" className="h-8 w-auto" />
            <div>
              <p className="text-white/30 text-[10px] font-semibold tracking-[0.2em] leading-none mb-0.5">COACH CONSOLE</p>
              <p className="text-white font-semibold text-sm leading-none">{currentUser?.name}</p>
            </div>
          </div>
          <button onClick={doLogout} className="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center">
            <LogOut size={16} className="text-white/70" />
          </button>
        </div>

        {tab === "dashboard" && <CoachDashboard onNavigate={setTab} />}
        {tab === "clients" && <CoachClients showToast={showToast} />}
        {tab === "programs" && <CoachPrograms showToast={showToast} />}
        {tab === "exercises" && <CoachExercises showToast={showToast} />}
        {tab === "settings" && <CoachSettings onLogout={doLogout} />}

        <div className="fixed bottom-0 left-0 right-0 flex justify-center z-50">
          <div className="w-full max-w-md bg-[#0F1012]/95 backdrop-blur border-t border-white/5 flex px-2 pb-safe">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)} className="flex-1 flex flex-col items-center gap-1 py-3">
                  <Icon size={20} className={active ? "text-white" : "text-white/35"} strokeWidth={active ? 2.4 : 2} />
                  <span className={`text-[10px] font-medium ${active ? "text-white" : "text-white/35"}`}>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <Toast message={toast.message} show={toast.show} />
      </div>
    </div>
  );
}
