import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../lib/AppContext";
import { Logo, Toast, Avatar, BottomSheet } from "../components/ui";
import { LayoutDashboard, Users, ClipboardList, MessageCircle, Library, Settings, LogOut, Bell, SlidersHorizontal, Trophy } from "lucide-react";
import CoachDashboard from "./CoachDashboard";
import CoachClients from "./CoachClients";
import CoachPrograms from "./CoachPrograms";
import CoachLibrary from "./CoachLibrary";
import CoachMessages from "./CoachMessages";
import CoachChallenges from "./CoachChallenges";
import CoachMore from "./CoachMore";

const MAIN_MENU = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "messages", label: "Messages", icon: MessageCircle },
  { id: "clients", label: "Clients", icon: Users },
  { id: "programs", label: "Programs", icon: ClipboardList },
  { id: "library", label: "Library", icon: Library },
  { id: "challenges", label: "Challenges", icon: Trophy },
];

const OTHER_MENU = [{ id: "more", label: "Settings", icon: Settings }];

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function NotificationIcon({ type }) {
  if (type === "preference_update") return <SlidersHorizontal size={15} className="text-blue-500" />;
  return <Bell size={15} className="text-blue-500" />;
}

function NotificationsPanel({ open, onClose, notifications, onMarkRead, onMarkAllRead }) {
  const unreadCount = notifications.filter((n) => !n.read).length;
  return (
    <BottomSheet open={open} onClose={onClose} title="Notifications">
      {notifications.length > 0 && unreadCount > 0 && (
        <button onClick={onMarkAllRead} className="text-blue-600 text-xs font-semibold mb-3">
          Mark all as read
        </button>
      )}
      {notifications.length === 0 ? (
        <p className="text-black/40 text-sm text-center py-8">No notifications yet.</p>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => !n.read && onMarkRead(n.id)}
              className={`w-full text-left flex items-start gap-3 rounded-xl px-3.5 py-3 border ${
                n.read ? "border-black/5 bg-white" : "border-blue-100 bg-blue-50/50"
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                <NotificationIcon type={n.type} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-black text-sm font-semibold">{n.clientName || "A client"}</p>
                <p className="text-black/60 text-xs mt-0.5">{n.message}</p>
                <p className="text-black/30 text-[11px] mt-1">{timeAgo(n.createdAt)}</p>
              </div>
              {!n.read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
            </button>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}

export default function CoachShell() {
  const { currentUser, logout, db, markNotificationRead, markAllNotificationsRead } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState("dashboard");
  const [clientSearch, setClientSearch] = useState("");
  const [toast, setToast] = useState({ show: false, message: "" });
  const [notifOpen, setNotifOpen] = useState(false);

  const notifications = db.notifications || [];
  const unreadNotifCount = notifications.filter((n) => !n.read).length;

  function showToast(message) {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: "" }), 1800);
  }

  function doLogout() {
    logout();
    navigate("/login", { replace: true });
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
        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          active ? "bg-white text-black" : "text-white/55 hover:bg-white/8 hover:text-white/90"
        }`}
      >
        <Icon size={17} strokeWidth={active ? 2.4 : 2} />
        <span className="flex-1 text-left">{item.label}</span>
        {item.id === "messages" && unreadMessages && <span className="w-2 h-2 rounded-full bg-blue-400" />}
      </button>
    );
  }

  return (
    <div className="coach-shell w-full min-h-screen bg-white font-sans flex">
      {/* desktop sidebar */}
      <div className="dark-chrome hidden md:flex w-64 shrink-0 h-screen sticky top-0 flex-col bg-[#0A0A0C]">
        <div className="px-5 pt-7 pb-6">
          <Logo variant="wordmark" tone="white" className="h-9 w-auto" />
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          <p className="text-white/25 text-[10px] font-semibold tracking-[0.15em] px-3.5 mb-2">MAIN MENU</p>
          <div className="space-y-1">
            {MAIN_MENU.map((item) => (
              <NavButton key={item.id} item={item} />
            ))}
          </div>

          <p className="text-white/25 text-[10px] font-semibold tracking-[0.15em] px-3.5 mt-6 mb-2">OTHER</p>
          <div className="space-y-1">
            {OTHER_MENU.map((item) => (
              <NavButton key={item.id} item={item} />
            ))}
          </div>
        </div>

        <div className="m-3 p-3 rounded-lg bg-white/[0.04] border border-white/8 flex items-center gap-2.5">
          <Avatar name={currentUser?.name} url={currentUser?.avatarUrl} size={36} onClick={() => setTab("more")} />
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold truncate">{currentUser?.name}</p>
            <p className="text-white/35 text-[11px] truncate">Coach</p>
          </div>
          <button onClick={() => setNotifOpen(true)} className="w-8 h-8 rounded-lg bg-white/8 hover:bg-white/15 flex items-center justify-center shrink-0 relative transition-colors" title="Notifications">
            <Bell size={14} className="text-white/70" />
            {unreadNotifCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center">
                {unreadNotifCount}
              </span>
            )}
          </button>
          <button onClick={doLogout} className="w-8 h-8 rounded-lg bg-white/8 hover:bg-white/15 flex items-center justify-center shrink-0 transition-colors" title="Sign out">
            <LogOut size={14} className="text-white/70" />
          </button>
        </div>
      </div>

      {/* mobile top bar */}
      <div className="dark-chrome md:hidden fixed top-0 left-0 right-0 z-40 bg-[#0A0A0C]">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo variant="wordmark" tone="white" className="h-7 w-auto" />
          <div className="flex items-center gap-2">
            <button onClick={() => setNotifOpen(true)} className="w-9 h-9 rounded-lg bg-white/8 flex items-center justify-center text-white/70 relative">
              <Bell size={16} />
              {unreadNotifCount > 0 && (
                <span className="absolute top-1 right-1.5 w-2 h-2 rounded-full bg-blue-400" />
              )}
            </button>
            <Avatar name={currentUser?.name} url={currentUser?.avatarUrl} size={34} onClick={() => setTab("more")} />
          </div>
        </div>
      </div>

      {/* main content */}
      <div className="flex-1 min-w-0 pt-14 pb-16 md:pt-0 md:pb-0">
        {tab === "dashboard" && <CoachDashboard onNavigate={setTab} />}
        {tab === "clients" && <CoachClients showToast={showToast} search={clientSearch} setSearch={setClientSearch} />}
        {tab === "programs" && <CoachPrograms showToast={showToast} />}
        {tab === "library" && <CoachLibrary showToast={showToast} />}
        {tab === "challenges" && <CoachChallenges showToast={showToast} />}
        {tab === "messages" && <CoachMessages />}
        {tab === "more" && <CoachMore onNavigate={setTab} onLogout={doLogout} showToast={showToast} />}
      </div>

      {/* mobile bottom tab bar */}
      <div className="dark-chrome md:hidden fixed bottom-0 left-0 right-0 z-40 flex justify-center">
        <div className="w-full bg-[#0A0A0C]/97 backdrop-blur flex px-1 pb-safe">
          {MAIN_MENU.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button key={item.id} onClick={() => setTab(item.id)} className="flex-1 flex flex-col items-center gap-1 py-2.5 relative">
                <Icon size={19} className={active ? "text-white" : "text-white/35"} strokeWidth={active ? 2.4 : 2} />
                <span className={`text-[9px] font-medium leading-none ${active ? "text-white" : "text-white/35"}`}>
                  {item.label}
                </span>
                {item.id === "messages" && unreadMessages && (
                  <span className="absolute top-1.5 right-[calc(50%-14px)] w-1.5 h-1.5 rounded-full bg-blue-400" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <Toast message={toast.message} show={toast.show} />
      <NotificationsPanel
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={notifications}
        onMarkRead={markNotificationRead}
        onMarkAllRead={markAllNotificationsRead}
      />
    </div>
  );
}
