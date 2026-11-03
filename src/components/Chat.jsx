// Shared look for the coach ↔ client chat (coach console thread and the
// client app's Messages), REGRESSION_TESTS.md #128. Dark, restrained, one
// accent: your own messages are MEASURE_BLUE, theirs a quiet charcoal (or
// white on the client's light theme) with a hairline. Messages from the
// same person within a few minutes are grouped — tighter spacing, one
// time under the group — and each day starts with a small divider.
import React, { useState } from "react";
import { Plus, X, ArrowUp, Video, Paperclip, Image as ImageIcon } from "lucide-react";
import { MEASURE_BLUE } from "../theme";
import { MessageComposerInput } from "./MessageComposerInput";
import { MicButton } from "./VoiceNote";

const GROUP_GAP_MS = 5 * 60 * 1000;

function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function dayLabel(ms, now = Date.now()) {
  const k = dayKey(ms);
  if (k === dayKey(now)) return "Today";
  if (k === dayKey(now - 86400000)) return "Yesterday";
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

// The thread as rows: a day divider before each new day, and each message
// marked first/last of its run (same sender, same day, < 5 min apart).
export function chatRows(thread, isMine, now = Date.now()) {
  const rows = [];
  thread.forEach((m, i) => {
    const prev = thread[i - 1];
    const next = thread[i + 1];
    const newDay = !prev || dayKey(prev.date) !== dayKey(m.date);
    if (newDay) rows.push({ type: "day", key: `day-${m.id}`, label: dayLabel(m.date, now) });
    const joinsPrev = !newDay && prev && prev.from === m.from && m.date - prev.date < GROUP_GAP_MS;
    const joinsNext = next && next.from === m.from && dayKey(next.date) === dayKey(m.date) && next.date - m.date < GROUP_GAP_MS;
    rows.push({ type: "msg", key: m.id, m, mine: isMine(m), first: !joinsPrev, last: !joinsNext });
  });
  return rows;
}

export function ChatDayDivider({ label, dark }) {
  return (
    <div className="flex justify-center pt-5 pb-2">
      <span className={`text-[10.5px] font-semibold tracking-[0.12em] uppercase ${dark ? "text-white/40" : "text-black/40"}`}>{label}</span>
    </div>
  );
}

// Bubble colours for the content inside (attachments, labels).
export function bubbleTone(mine, dark) {
  if (mine) return { text: "text-white", muted: "text-white/65", chip: "bg-white/15 text-white" };
  return dark ? { text: "text-white/90", muted: "text-white/45", chip: "bg-white/8 text-white" } : { text: "text-black/85", muted: "text-black/45", chip: "bg-black/5 text-black" };
}

export function ChatBubble({ mine, first, last, dark, time, children, wide = false }) {
  const tail = mine ? (last ? "rounded-br-[6px]" : "") : last ? "rounded-bl-[6px]" : "";
  const join = mine ? (!first ? "rounded-tr-[6px]" : "") : !first ? "rounded-tl-[6px]" : "";
  const theirs = dark
    ? { backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.06)" }
    : { backgroundColor: "#FFFFFF", border: "1px solid rgba(20,19,15,0.08)" };
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"} ${first ? "mt-3" : "mt-[3px]"}`}>
      <div
        className={`${wide ? "max-w-[85%]" : "max-w-[78%]"} rounded-[20px] ${tail} ${join} px-3.5 py-2.5 text-[14.5px] leading-[1.4] ${bubbleTone(mine, dark).text}`}
        style={mine ? { backgroundColor: MEASURE_BLUE } : theirs}
      >
        {children}
      </div>
      {last && time && <p className={`text-[10.5px] mt-1 px-1 tabular-nums ${dark ? "text-white/35" : "text-black/35"}`}>{time}</p>}
    </div>
  );
}

export function chatTime(ms) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function uploadIndicator(uploadPct, dark) {
  if (uploadPct > 0) return <span className="text-[10px] font-bold tabular-nums">{Math.round(uploadPct * 100)}%</span>;
  return <span className={`w-4 h-4 border-2 rounded-full animate-spin ${dark ? "border-white/30 border-t-white" : "border-black/20 border-t-black"}`} />;
}

// The composer: one + for attachments (opens photo / video / PDF), the
// growing message box, and a round blue send (or the mic when empty).
export function ChatComposer({ value, onChange, onSend, placeholder, dark, uploadPct = null, onPickPhoto, onPickVideo, onPickPdf, videoLabel = "Video", canRecord, onRecord, recordDisabled }) {
  const [attachOpen, setAttachOpen] = useState(false);
  const uploading = uploadPct !== null;
  const hasText = !!value.trim();
  const soft = dark ? "bg-white/[0.07] text-white" : "bg-black/[0.05] text-black";
  const pick = (fn) => () => {
    setAttachOpen(false);
    fn?.();
  };
  return (
    <div>
      {attachOpen && !uploading && (
        <div className="flex gap-2 mb-2.5">
          {[
            ["Photo", ImageIcon, onPickPhoto],
            [videoLabel, Video, onPickVideo],
            ["PDF", Paperclip, onPickPdf],
          ].map(([label, Icon, fn]) => (
            <button key={label} type="button" onClick={pick(fn)} className={`flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[12.5px] font-semibold ${soft}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => setAttachOpen((o) => !o)}
          disabled={uploading}
          aria-label={attachOpen ? "Close attachments" : "Add an attachment"}
          aria-expanded={attachOpen}
          className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-colors ${soft}`}
        >
          {uploading ? uploadIndicator(uploadPct, dark) : attachOpen ? <X size={18} /> : <Plus size={19} />}
        </button>
        <MessageComposerInput
          value={value}
          onChange={onChange}
          onSend={onSend}
          placeholder={placeholder}
          className={`flex-1 min-w-0 rounded-[22px] px-4 py-3 text-[14.5px] outline-none ${dark ? "bg-white/[0.07] text-white placeholder:text-white/35" : "bg-black/[0.05] text-black placeholder:text-black/35"}`}
        />
        {canRecord && !hasText ? (
          <MicButton onClick={onRecord} disabled={uploading || recordDisabled} dark={dark} />
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!hasText}
            aria-label="Send"
            className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-white transition-opacity disabled:opacity-35"
            style={{ backgroundColor: MEASURE_BLUE }}
          >
            <ArrowUp size={19} strokeWidth={2.4} />
          </button>
        )}
      </div>
    </div>
  );
}
