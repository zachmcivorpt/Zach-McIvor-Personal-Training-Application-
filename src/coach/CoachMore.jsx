import React, { useRef, useState } from "react";
import { useApp } from "../lib/AppContext";
import { Card, DangerButton, AvatarPicker, Tagline, TextArea } from "../components/ui";
import { fileToDataUrl } from "../lib/image";
import { Video, LogOut, ChevronRight, MessageSquareText, Paperclip, X, Upload } from "lucide-react";

function WelcomeMessageCard() {
  const { db, updateWelcomeMessage } = useApp();
  const welcome = db.welcomeMessage || {};
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") return;
    setUploading(true);
    const dataUrl = await fileToDataUrl(file);
    updateWelcomeMessage({ attachmentName: file.name, attachmentUrl: dataUrl });
    setUploading(false);
  }

  return (
    <Card>
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
          <MessageSquareText size={18} className="text-blue-500" />
        </div>
        <div className="flex-1">
          <p className="text-black font-semibold text-sm">Automated Welcome Message</p>
          <p className="text-black/40 text-xs mt-0.5">Sent to a client automatically the moment they activate their account</p>
        </div>
        <button
          onClick={() => updateWelcomeMessage({ autoSend: !welcome.autoSend })}
          className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${welcome.autoSend ? "bg-blue-500" : "bg-black/15"}`}
          aria-label={welcome.autoSend ? "Turn off auto-send" : "Turn on auto-send"}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${welcome.autoSend ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>

      <p className="text-black/30 text-[11px] mt-3 mb-1.5">
        MESSAGE — use <span className="font-mono bg-black/5 px-1 rounded">{"{name}"}</span> for the client's first name
      </p>
      <TextArea rows={6} value={welcome.text || ""} onChange={(e) => updateWelcomeMessage({ text: e.target.value })} />

      <p className="text-black/30 text-[11px] mt-4 mb-1.5">ATTACHMENT (OPTIONAL)</p>
      {welcome.attachmentUrl ? (
        <div className="flex items-center gap-2 bg-black/5 border border-black/10 rounded-xl px-3.5 py-2.5">
          <Paperclip size={14} className="text-black/40 shrink-0" />
          <span className="text-black text-sm flex-1 truncate">{welcome.attachmentName}</span>
          <button
            onClick={() => updateWelcomeMessage({ attachmentName: "", attachmentUrl: "" })}
            className="w-6 h-6 shrink-0 flex items-center justify-center text-black/30 hover:text-black/60"
            aria-label="Remove attachment"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <input ref={fileRef} type="file" accept="application/pdf" onChange={handleFile} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 bg-black/5 border border-dashed border-black/15 text-black/60 text-sm font-medium py-3 rounded-xl"
          >
            <Upload size={15} /> {uploading ? "Uploading…" : "Attach a PDF (e.g. a nutrition guide)"}
          </button>
        </>
      )}
      <p className="text-black/25 text-[11px] mt-2 leading-relaxed">
        Stored in this browser only — a very large PDF can use up local storage quickly, so a few MB is plenty.
      </p>
    </Card>
  );
}

export default function CoachMore({ onNavigate, onLogout }) {
  const { currentUser, updateUser } = useApp();

  return (
    <div className="max-w-xl px-4 py-5 md:px-8 md:py-8 space-y-4">
      <div>
        <h1 className="text-black text-2xl font-bold">Settings</h1>
      </div>

      <Card onClick={() => onNavigate("library")}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-black/10 flex items-center justify-center shrink-0">
            <Video size={18} className="text-black" />
          </div>
          <div className="flex-1">
            <p className="text-black font-semibold text-sm">Manage Exercise Library</p>
            <p className="text-black/40 text-xs mt-0.5">Upload custom exercise videos</p>
          </div>
          <ChevronRight size={18} className="text-black/30" />
        </div>
      </Card>

      <WelcomeMessageCard />

      <Card>
        <div className="flex items-center gap-4">
          <AvatarPicker
            name={currentUser?.name}
            url={currentUser?.avatarUrl}
            size={64}
            onChange={(dataUrl) => updateUser(currentUser.id, { avatarUrl: dataUrl })}
          />
          <div>
            <p className="text-black font-bold">{currentUser?.name}</p>
            <p className="text-black/40 text-sm">{currentUser?.email}</p>
            <p className="text-black/30 text-xs mt-0.5">@{currentUser?.username}</p>
          </div>
        </div>
      </Card>

      <DangerButton className="w-full" onClick={onLogout}>
        <LogOut size={14} /> Sign out
      </DangerButton>

      <div className="flex justify-center pt-4">
        <Tagline />
      </div>
    </div>
  );
}
