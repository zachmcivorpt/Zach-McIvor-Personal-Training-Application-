import React from "react";
import { useApp } from "../lib/AppContext";
import { Card, Logo, DangerButton } from "../components/ui";
import { LogOut, Info } from "lucide-react";

export default function CoachSettings({ onLogout }) {
  const { currentUser } = useApp();

  return (
    <div className="px-5 pb-6 space-y-4">
      <div>
        <h1 className="text-white text-2xl font-bold">Settings</h1>
        <p className="text-white/40 text-sm mt-0.5">Your coach profile and branding.</p>
      </div>

      <Card>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-2xl font-bold text-white">
            {currentUser?.name?.[0]}
          </div>
          <div>
            <p className="text-white text-lg font-bold">{currentUser?.name}</p>
            <p className="text-white/40 text-sm">{currentUser?.email}</p>
            <p className="text-white/30 text-xs mt-0.5">@{currentUser?.username}</p>
          </div>
        </div>
      </Card>

      <Card className="flex flex-col items-center py-8">
        <Logo variant="wordmark" tone="white" className="h-14 w-auto mb-3" />
        <p className="text-white/40 text-xs text-center">
          This mark appears across sign-in, the client app header, and workout completion screens.
        </p>
      </Card>

      <Card>
        <div className="flex gap-3">
          <Info size={16} className="text-white/40 shrink-0 mt-0.5" />
          <p className="text-white/40 text-xs leading-relaxed">
            This console runs on local, on-device storage — perfect for demoing the full coach → client workflow. To go live with
            real client accounts, uploaded videos, and multi-device sync, connect it to a backend (auth, database, and object
            storage for video).
          </p>
        </div>
      </Card>

      <DangerButton className="w-full" onClick={onLogout}>
        <LogOut size={14} /> Sign out
      </DangerButton>
    </div>
  );
}
