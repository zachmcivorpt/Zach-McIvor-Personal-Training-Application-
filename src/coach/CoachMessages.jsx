import React, { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/AppContext";
import { FullScreenOverlay, Avatar } from "../components/ui";
import { Search, ChevronLeft, MessageCircle, FileText, X, Reply } from "lucide-react";
import { uploadMessageVideo, uploadMessagePdf, uploadMessageImage, uploadMessageAudio } from "../lib/storage";
import { useVoiceRecorder, voiceNotesSupported } from "../lib/voiceNote";
import { VoiceRecordingBar, VoiceNotePlayer } from "../components/VoiceNote";
import { formCheckLabel } from "../lib/formCheck";
import { CLIENT_DARK_BG, CLIENT_DARK_BORDER, MEASURE_BLUE, MEASURE_BLUE_SOFT } from "../theme";
import { ChatBubble, ChatComposer, ChatDayDivider, bubbleTone, chatRows, chatTime } from "../components/Chat";
import { useTextEntryFocused } from "../lib/textEntryFocus";

// tone="mine" = the coach's own (blue) bubble; tone="theirs" = the client's
// (charcoal) bubble. Both need a light chip on the dark/blue fill.
function AttachmentPill({ attachment, tone = "theirs" }) {
  if (!attachment) return null;
  if (attachment.type === "audio") {
    // mine + dark={false} gives white labels, right on the blue bubble.
    return <VoiceNotePlayer attachment={attachment} mine={tone === "mine"} dark={tone !== "mine"} />;
  }
  if (attachment.type === "video") {
    return <video src={attachment.url} controls playsInline className="mt-2 w-full max-w-[220px] rounded-lg bg-black" />;
  }
  if (attachment.type === "image") {
    return (
      <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block mt-2">
        <img
          src={attachment.url}
          alt={attachment.name || "Photo"}
          loading="eager"
          decoding="async"
          className="w-full max-w-[220px] rounded-lg object-cover"
        />
      </a>
    );
  }
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 ${
        tone === "mine" ? "bg-white/15 text-white" : "bg-white/8 text-white"
      }`}
    >
      <FileText size={14} className="shrink-0" />
      <span className="text-xs font-medium truncate">{attachment.name}</span>
    </a>
  );
}

// The message list + composer, with no header/chrome of its own — reused by
// both the full-screen ThreadView (opened from a client's own profile) and
// the inline right-hand panel of the desktop Messages screen.
export function ThreadMessages({ client }) {
  const { db, sendMessage, updateUser } = useApp();
  const typing = useTextEntryFocused();
  const [input, setInput] = useState("");
  const [uploadPct, setUploadPct] = useState(null);
  const [uploadError, setUploadError] = useState("");
  // Replying to a client's form-check video — the reply is linked to that
  // exercise so the client sees it next to it in their next workout.
  const [replyTo, setReplyTo] = useState(null); // { messageId, exerciseId, exerciseName }
  const recorder = useVoiceRecorder();
  const canRecord = voiceNotesSupported();
  const videoInputRef = useRef(null);
  const pdfInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const endRef = useRef(null);
  const thread = db.messages[client.id] || [];

  useEffect(() => {
    setTimeout(() => endRef.current?.scrollIntoView({ block: "end" }), 50);
  }, [thread.length]);

  // Opening this thread is itself "the coach has seen it" — the
  // roster/nav "awaiting reply" badge (CoachClients.jsx, CoachShell.jsx)
  // reads this back and clears as soon as it's newer than the client's
  // last message, so a coach doesn't have to actually type a reply just
  // to make the badge go away once they've read it.
  useEffect(() => {
    const lastMsg = thread[thread.length - 1];
    if (lastMsg && lastMsg.from === "client" && lastMsg.date > (client.coachMessagesSeenAt || 0)) {
      updateUser(client.id, { coachMessagesSeenAt: Date.now() });
    }
  }, [client.id, thread.length]);

  function send() {
    if (!input.trim()) return;
    sendMessage(client.id, "coach", input, undefined, replyTo ? { replyTo } : undefined);
    setInput("");
    setReplyTo(null);
  }

  async function sendVoiceNote() {
    const recording = await recorder.stop();
    if (!recording) return;
    setUploadError("");
    setUploadPct(0);
    try {
      const attachment = await uploadMessageAudio(client.id, recording.blob, recording.durationSec, setUploadPct);
      sendMessage(client.id, "coach", "", attachment, replyTo ? { replyTo } : undefined);
      setReplyTo(null);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploadPct(null);
    }
  }

  async function handleVideoFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError("");
    setUploadPct(0);
    try {
      const attachment = await uploadMessageVideo(client.id, file, setUploadPct);
      sendMessage(client.id, "coach", "", attachment);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploadPct(null);
    }
  }

  async function handlePdfFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError("");
    setUploadPct(0);
    try {
      const attachment = await uploadMessagePdf(client.id, file, setUploadPct);
      sendMessage(client.id, "coach", "", attachment);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploadPct(null);
    }
  }

  async function handleImageFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError("");
    setUploadPct(0);
    try {
      const attachment = await uploadMessageImage(client.id, file, setUploadPct);
      sendMessage(client.id, "coach", "", attachment);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploadPct(null);
    }
  }

  const rows = chatRows(thread, (m) => m.from === "coach");

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 md:px-6 pt-1 pb-4">
        {thread.length === 0 && <p className="text-white/45 text-sm text-center py-14">No messages yet with {client.name?.split(" ")[0] || "them"}.</p>}
        {rows.map((row) => {
          if (row.type === "day") return <ChatDayDivider key={row.key} label={row.label} dark />;
          const { m, mine, first, last } = row;
          const tone = bubbleTone(mine, true);
          return (
            <ChatBubble key={row.key} mine={mine} first={first} last={last} dark time={chatTime(m.date)}>
              {m.attachment?.formCheck && (
                <p className={`text-[10px] font-bold tracking-[0.1em] uppercase mb-1 ${tone.muted}`}>Form check · {formCheckLabel(m.attachment.formCheck)}</p>
              )}
              {m.replyTo && <p className={`text-[11px] font-semibold mb-1 ${tone.muted}`}>Re: form check · {m.replyTo.exerciseName}</p>}
              {m.text && !m.attachment?.formCheck && <p className="whitespace-pre-line break-words">{m.text}</p>}
              <AttachmentPill attachment={m.attachment} tone={mine ? "mine" : "theirs"} />
              {!mine && m.attachment?.formCheck && (
                <button
                  type="button"
                  onClick={() => setReplyTo({ messageId: m.id, exerciseId: m.attachment.formCheck.exerciseId, exerciseName: m.attachment.formCheck.exerciseName })}
                  className="mt-2 flex items-center gap-1.5 text-xs font-semibold"
                  style={{ color: MEASURE_BLUE }}
                >
                  <Reply size={13} /> Reply with feedback
                </button>
              )}
            </ChatBubble>
          );
        })}
        <div ref={endRef} />
      </div>

      {(uploadError || recorder.error) && (
        <div className="mx-4 md:mx-6 mb-2 flex items-center justify-between gap-2 bg-red-500/10 border border-red-500/25 text-red-400 text-xs px-3 py-2 rounded-lg">
          <span>{uploadError || recorder.error}</span>
          <button
            onClick={() => {
              setUploadError("");
              recorder.clearError();
            }}
            aria-label="Dismiss"
          >
            <X size={13} />
          </button>
        </div>
      )}
      {replyTo && (
        <div className="mx-4 md:mx-6 mb-2 flex items-center justify-between gap-2 text-xs text-white/80 border-l-2 pl-3 py-1" style={{ borderColor: MEASURE_BLUE }}>
          <span className="truncate">
            Replying to form check · <span className="font-semibold text-white">{replyTo.exerciseName}</span>
          </span>
          <button onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="text-white/60 shrink-0">
            <X size={13} />
          </button>
        </div>
      )}
      <div className={`px-4 md:px-6 pt-2.5 ${typing ? "pb-2" : "pb-[max(1.25rem,env(safe-area-inset-bottom))]"} border-t`} style={{ borderColor: CLIENT_DARK_BORDER }}>
        <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoFile} className="hidden" />
        <input ref={pdfInputRef} type="file" accept="application/pdf" onChange={handlePdfFile} className="hidden" />
        <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageFile} className="hidden" />
        {recorder.state === "recording" ? (
          <VoiceRecordingBar seconds={recorder.seconds} onCancel={recorder.cancel} onSend={sendVoiceNote} />
        ) : (
          <ChatComposer
            dark
            value={input}
            onChange={setInput}
            onSend={send}
            placeholder={replyTo ? "Write your feedback..." : `Message ${client.name?.split(" ")[0] || "your client"}...`}
            uploadPct={uploadPct}
            onPickPhoto={() => imageInputRef.current?.click()}
            onPickVideo={() => videoInputRef.current?.click()}
            onPickPdf={() => pdfInputRef.current?.click()}
            canRecord={canRecord}
            onRecord={recorder.start}
            recordDisabled={recorder.state !== "idle"}
          />
        )}
      </div>
    </>
  );
}

// Full-screen variant — used when opened from a client's own profile page,
// which isn't already inside a 2-column messages layout.
export function ThreadView({ client, onClose }) {
  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[90] flex flex-col" style={{ backgroundColor: CLIENT_DARK_BG }}>
        <div className="flex items-center gap-3 px-5 pt-6 pb-3 border-b" style={{ borderColor: CLIENT_DARK_BORDER }}>
          <button onClick={onClose} className="w-9 h-9 -ml-2 flex items-center justify-center text-white">
            <ChevronLeft size={20} />
          </button>
          <Avatar name={client.name} url={client.avatarUrl} size={36} dark />
          <div>
            <p className="text-white font-semibold text-sm leading-none">{client.name}</p>
            <p className="text-white text-xs mt-1">{client.username}</p>
          </div>
        </div>
        <ThreadMessages client={client} />
      </div>
    </FullScreenOverlay>
  );
}

export default function CoachMessages() {
  const { db } = useApp();
  // The tab bar hides while typing (CoachShell), so drop its space too.
  const typing = useTextEntryFocused();
  const [search, setSearch] = useState("");
  const [openClientId, setOpenClientId] = useState(null);

  const clients = db.users
    .filter((u) => u.role === "client" && u.status === "active")
    .filter((c) => (c.name || "").toLowerCase().includes(search.toLowerCase()))
    .map((c) => {
      const thread = db.messages[c.id] || [];
      const lastMsg = thread[thread.length - 1];
      return { ...c, lastMsg };
    })
    .sort((a, b) => (b.lastMsg?.date || 0) - (a.lastMsg?.date || 0));

  const openClient = clients.find((c) => c.id === openClientId) || db.users.find((u) => u.id === openClientId) || null;

  return (
    <div
      className={`h-screen md:h-screen flex flex-col -mt-14 -mb-16 pt-14 ${typing ? "pb-0" : "pb-16"} md:mt-0 md:mb-0 md:pt-0 md:pb-0`}
      style={{ backgroundColor: CLIENT_DARK_BG }}
    >
      <div className={`px-4 pt-5 pb-4 md:px-8 md:pt-8 shrink-0 ${openClientId ? "hidden md:block" : ""}`}>
        <h1 className="text-white text-2xl font-bold">Messages</h1>
        <p className="text-white text-sm mt-0.5">Direct chat with your active clients</p>
      </div>

      <div className="flex-1 min-h-0 flex md:border-t" style={{ borderColor: CLIENT_DARK_BORDER }}>
        <div
          className={`w-full md:w-80 shrink-0 md:border-r flex-col min-h-0 ${openClientId ? "hidden md:flex" : "flex"}`}
          style={{ borderColor: CLIENT_DARK_BORDER }}
        >
          <div className="p-4">
            <div className="flex items-center gap-2 bg-white/8 rounded-xl px-3 py-2.5">
              <Search size={15} className="text-white" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search clients"
                className="bg-transparent outline-none text-white text-sm flex-1 placeholder:text-white"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-4">
            {clients.length === 0 && (
              <p className="text-white text-sm text-center py-10 px-4">
                <MessageCircle size={20} className="mx-auto mb-2 text-white" />
                No active clients to message yet.
              </p>
            )}
            {clients.map((c) => (
              <button
                key={c.id}
                onClick={() => setOpenClientId(c.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-white/[0.06]"
                style={openClientId === c.id ? { backgroundColor: MEASURE_BLUE_SOFT } : undefined}
              >
                <Avatar name={c.name} url={c.avatarUrl} size={40} dark />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-white font-semibold text-sm truncate">{c.name}</p>
                    {c.lastMsg && (
                      <span className="text-white text-[11px] shrink-0 ml-2">
                        {new Date(c.lastMsg.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                  <p className="text-white text-xs truncate mt-0.5">
                    {c.lastMsg ? `${c.lastMsg.from === "coach" ? "You: " : ""}${c.lastMsg.text}` : "No messages yet"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className={`flex-1 min-w-0 flex-col ${openClientId ? "flex" : "hidden md:flex"}`}>
          {openClient ? (
            <>
              <div className="flex items-center gap-2 px-3 md:px-5 py-3 md:py-3.5 border-b" style={{ borderColor: CLIENT_DARK_BORDER }}>
                <button
                  onClick={() => setOpenClientId(null)}
                  aria-label="Back to clients"
                  className="md:hidden w-8 h-8 -ml-1 flex items-center justify-center text-white shrink-0"
                >
                  <ChevronLeft size={19} />
                </button>
                <Avatar name={openClient.name} url={openClient.avatarUrl} size={34} dark />
                <p className="text-white font-semibold text-sm">{openClient.name}</p>
              </div>
              {/* Keyed by client id so switching the open thread directly
                  from one client to another (desktop two-pane view) remounts
                  this component instead of reusing it — without this, its
                  local `input`/`uploadPct`/`uploadError` state (and the
                  "mark as seen" effect) carried over from the PREVIOUS
                  client, so an unsent draft typed for client A could end up
                  sent to client B after switching. The mobile list view
                  already got this for free (it unmounts through `null`
                  before showing a new thread); this key makes the desktop
                  split view behave the same way. */}
              <ThreadMessages key={openClient.id} client={openClient} />
            </>
          ) : (
            <div className="flex-1 flex-col items-center justify-center text-center hidden md:flex">
              <MessageCircle size={28} className="text-white mb-3" />
              <p className="text-white text-sm">Select a client to start messaging.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
