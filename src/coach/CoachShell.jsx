import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../lib/AppContext";
import { Logo, Toast, Avatar } from "../components/ui";
import { LayoutDashboard, Users, ClipboardList, MessageCircle, Dumbbell, Settings, LogOut, Search, X } from "lucide-react";
import CoachDashboard from "./CoachDashboard";
import CoachClients from "./CoachClients";
import CoachPrograms from "./CoachPrograms";
import CoachExercises from "./CoachExercises";
import CoachMessages from "./CoachMessages";
import CoachMore from "./CoachMore";

const MAIN_MENU = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "messages", label: "Messages", icon: MessageCircle },
  { id: "clients", label: "Clients", icon: Users },
  { id: "programs", label: "Programs", icon: ClipboardList },
  { id: "exercises", label: "Exercise Library", icon: Dumbbell },
];

const OTHER_MENU = [{ id: "more", label: "Settings", icon: Settings }];

export default function CoachShell() {
  const { currentUser, logout, db } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState("dashboard");
  const [clientSearch, setClientSearch] = useState("");
  const [toast, setToast] = useState({ show: false, message: "" });
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  function showToast(message) {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: "" }), 1800);
  }

  function doLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  function goToClients(query) {
    setClientSearch(query);
    setTab("clients");
  }

  const activeClients = db.users.filter((u) => u.role === "client" && u.status === "active");
  const unreadMessages = activeClients.some((c) => {
    const thread = db.messages[c.id] || [];
    const last = thread[thread.length - 1];
    return last && last.from === "client";
  });

  function NavButton({ item }) {
    const Icon = item.icon;
    const active = tab === item.id;
    return (
      <button
        onClick={() => setTab(item.id)}
        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
          active ? "bg-black text-white" : "text-black/60 hover:bg-black/5 hover:text-black/90"
        }`}
      >
        <Icon size={17} strokeWidth={active ? 2.4 : 2} />
        <span className="flex-1 text-left">{item.label}</span>
        {item.id === "messages" && unreadMessages && (
          <span className={`w-2 h-2 rounded-full ${active ? "bg-white" : "bg-black"}`} />
        )}
      </button>
    );
  }

  return (
    <div className="w-full min-h-screen bg-white font-sans flex">
      {/* desktop sidebar */}
      <div className="hidden md:flex w-64 shrink-0 h-screen sticky top-0 flex-col border-r border-black/8 bg-[#F7F7F8]">
        <div className="px-5 pt-6 pb-5">
          <Logo variant="wordmark" tone="black" className="h-9 w-auto" />
        </div>

        <div className="px-4 mb-5">
          <div className="flex items-center gap-2 bg-black/5 rounded-xl px-3 py-2.5">
            <Search size={15} className="text-black/40" />
            <input
              value={clientSearch}
              onChange={(e) => goToClients(e.target.value)}
              placeholder="Find a client"
              className="bg-transparent outline-none text-black text-sm flex-1 placeholder:text-black/30"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          <p className="text-black/25 text-[10px] font-semibold tracking-[0.15em] px-3.5 mb-2">MAIN MENU</p>
          <div className="space-y-1">
            {MAIN_MENU.map((item) => (
              <NavButton key={item.id} item={item} />
            ))}
          </div>

          <p className="text-black/25 text-[10px] font-semibold tracking-[0.15em] px-3.5 mt-6 mb-2">OTHER</p>
          <div className="space-y-1">
            {OTHER_MENU.map((item) => (
              <NavButton key={item.id} item={item} />
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-black/8 flex items-center gap-2.5">
          <Avatar name={currentUser?.name} url={currentUser?.avatarUrl} size={38} onClick={() => setTab("more")} />
          <div className="flex-1 min-w-0">
            <p className="text-black text-sm font-semibold truncate">{currentUser?.name}</p>
            <p className="text-black/35 text-[11px] truncate">Coach</p>
          </div>
          <button onClick={doLogout} className="w-8 h-8 rounded-full bg-black/8 flex items-center justify-center shrink-0" title="Sign out">
            <LogOut size={14} className="text-black/60" />
          </button>
        </div>
      </div>

      {/* mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-black/8">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo variant="wordmark" tone="black" className="h-7 w-auto" />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileSearchOpen((o) => !o)}
              className="w-9 h-9 rounded-full bg-black/5 flex items-center justify-center text-black/60"
            >
              {mobileSearchOpen ? <X size={16} /> : <Search size={16} />}
            </button>
            <Avatar name={currentUser?.name} url={currentUser?.avatarUrl} size={34} onClick={() => setTab("more")} />
          </div>
        </div>
        {mobileSearchOpen && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 bg-black/5 rounded-xl px-3 py-2.5">
              <Search size={15} className="text-black/40 shrink-0" />
              <input
                autoFocus
                value={clientSearch}
                onChange={(e) => goToClients(e.target.value)}
                placeholder="Find a client"
                className="bg-transparent outline-none text-black text-sm flex-1 placeholder:text-black/30"
              />
            </div>
          </div>
        )}
      </div>

      {/* main content */}
      <div className={`flex-1 min-w-0 ${mobileSearchOpen ? "pt-[104px]" : "pt-14"} pb-16 md:pt-0 md:pb-0`}>
        {tab === "dashboard" && <CoachDashboard onNavigate={setTab} />}
        {tab === "clients" && <CoachClients showToast={showToast} search={clientSearch} setSearch={setClientSearch} />}
        {tab === "programs" && <CoachPrograms showToast={showToast} />}
        {tab === "exercises" && <CoachExercises showToast={showToast} />}
        {tab === "messages" && <CoachMessages />}
        {tab === "more" && <CoachMore onNavigate={setTab} onLogout={doLogout} />}
      </div>

      {/* mobile bottom tab bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex justify-center">
        <div className="w-full bg-white/95 backdrop-blur border-t border-black/8 flex px-1 pb-safe">
          {MAIN_MENU.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button key={item.id} onClick={() => setTab(item.id)} className="flex-1 flex flex-col items-center gap-1 py-2.5 relative">
                <Icon size={19} className={active ? "text-black" : "text-black/35"} strokeWidth={active ? 2.4 : 2} />
                <span className={`text-[9px] font-medium leading-none ${active ? "text-black" : "text-black/35"}`}>
                  {item.id === "exercises" ? "Library" : item.label}
                </span>
                {item.id === "messages" && unreadMessages && (
                  <span className="absolute top-1.5 right-[calc(50%-14px)] w-1.5 h-1.5 rounded-full bg-black" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <Toast message={toast.message} show={toast.show} />
    </div>
  );
}
