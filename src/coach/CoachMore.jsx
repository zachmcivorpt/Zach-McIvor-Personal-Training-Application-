import React from "react";
import { useApp } from "../lib/AppContext";
import { Card, DangerButton } from "../components/ui";
import { Video, LogOut, ChevronRight } from "lucide-react";

export default function CoachMore({ onNavigate, onLogout }) {
  const { currentUser } = useApp();

  return (
    <div className="px-5 pb-6 space-y-4">
      <div>
        <h1 className="text-white text-2xl font-bold">More</h1>
      </div>

      <Card onClick={() => onNavigate("exercises")}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <Video size={18} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="text-white font-semibold text-sm">Manage Exercise Library</p>
            <p className="text-white/40 text-xs mt-0.5">Upload custom exercise videos</p>
          </div>
          <ChevronRight size={18} className="text-white/30" />
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-xl font-bold text-white">
            {currentUser?.name?.[0]}
          </div>
          <div>
            <p className="text-white font-bold">{currentUser?.name}</p>
            <p className="text-white/40 text-sm">{currentUser?.email}</p>
            <p className="text-white/30 text-xs mt-0.5">@{currentUser?.username}</p>
          </div>
        </div>
      </Card>

      <DangerButton className="w-full" onClick={onLogout}>
        <LogOut size={14} /> Sign out
      </DangerButton>
    </div>
  );
}
