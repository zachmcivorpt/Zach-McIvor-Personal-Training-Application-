import React from "react";
import { Mic, Send, X } from "lucide-react";
import { formatVoiceDuration, MAX_VOICE_NOTE_SECONDS } from "../lib/voiceNote";

// Voice notes in chat (coached client app and coach console) — the bar shown
// while recording, the mic button, and the player in a message bubble.

export function VoiceRecordingBar({ seconds, onCancel, onSend, dark = true }) {
  return (
    <div className={`flex items-center gap-2 rounded-full pl-4 pr-1.5 py-1.5 ${dark ? "bg-white/8" : "bg-black/8"}`} role="status" aria-live="polite">
      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" aria-hidden="true" />
      <span className={`text-sm font-semibold tabular-nums flex-1 ${dark ? "text-white" : "text-black"}`}>
        Recording {formatVoiceDuration(seconds)}
        <span className={dark ? "text-white/35 font-normal" : "text-black/35 font-normal"}> / {formatVoiceDuration(MAX_VOICE_NOTE_SECONDS)}</span>
      </span>
      <button type="button" onClick={onCancel} aria-label="Cancel voice note" className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${dark ? "text-white/60" : "text-black/60"}`}>
        <X size={18} />
      </button>
      <button type="button" onClick={onSend} aria-label="Send voice note" className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${dark ? "bg-white text-black" : "bg-black text-white"}`}>
        <Send size={15} />
      </button>
    </div>
  );
}

export function MicButton({ onClick, disabled, dark = true, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Record a voice note"
      className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 disabled:opacity-50 ${dark ? "bg-white text-black" : "bg-black text-white"} ${className}`}
    >
      <Mic size={17} />
    </button>
  );
}

// `mine` = the bubble is the viewer's own (solid), so the label uses the
// bubble's contrasting tone.
export function VoiceNotePlayer({ attachment, mine = false, dark = true }) {
  const label = mine ? (dark ? "text-black/50" : "text-white/50") : dark ? "text-white/50" : "text-black/50";
  return (
    <div className="mt-1.5">
      <audio src={attachment.url} controls preload="metadata" className="w-[220px] max-w-full h-10" />
      <p className={`text-[10px] mt-0.5 flex items-center gap-1 ${label}`}>
        <Mic size={10} /> Voice note{attachment.durationSec ? ` · ${formatVoiceDuration(attachment.durationSec)}` : ""}
      </p>
    </div>
  );
}
