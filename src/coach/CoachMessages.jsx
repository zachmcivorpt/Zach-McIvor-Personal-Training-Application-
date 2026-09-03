import React, { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/AppContext";
import { FullScreenOverlay, Avatar } from "../components/ui";
import { Search, Send, ChevronLeft, MessageCircle } from "lucide-react";

// The message list + composer, with no header/chrome of its own — reused by
// both the full-screen ThreadView (opened from a client's own profile) and
// the inline right-hand panel of the desktop Messages screen.
function ThreadMessages({ client }) {
  const { db, sendMessage } = useApp();
  const [input, setInput] = useState("");
  const endRef = useRef(null);
  const thread = db.messages[client.id] || [];

  useEffect(() => {
    setTimeout(() => endRef.current?.scrollIntoView({ block: "end" }), 50);
  }, [thread.length]);

  function send() {
    if (!input.trim()) return;
    sendMessage(client.id, "coach", input);
    setInput("");
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {thread.length === 0 && <p className="text-black/30 text-sm text-center py-10">No messages yet with {client.name.split(" ")[0]}.</p>}
        {thread.map((m) => (
          <div key={m.id} className={`flex ${m.from === "coach" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${m.from === "coach" ? "bg-black text-white" : "bg-black/8 text-black/85"}`}>
              <p>{m.text}</p>
              <p className={`text-[10px] mt-1 ${m.from === "coach" ? "text-white/40" : "text-black/30"}`}>
                {new Date(m.date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="flex gap-2 px-5 pb-5 pt-2 border-t border-black/5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={`Message ${client.name.split(" ")[0]}...`}
          className="flex-1 bg-black/8 rounded-full px-4 py-3 text-sm text-black outline-none placeholder:text-black/30"
        />
        <button onClick={send} className="w-11 h-11 rounded-full bg-black flex items-center justify-center shrink-0">
          <Send size={16} className="text-white" />
        </button>
      </div>
    </>
  );
}

// Full-screen variant — used when opened from a client's own profile page,
// which isn't already inside a 2-column messages layout.
export function ThreadView({ client, onClose }) {
  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[90] bg-white flex flex-col">
        <div className="flex items-center gap-3 px-5 pt-6 pb-3 border-b border-black/5">
          <button onClick={onClose} className="w-9 h-9 -ml-2 flex items-center justify-center text-black/60">
            <ChevronLeft size={20} />
          </button>
          <Avatar name={client.name} url={client.avatarUrl} size={36} />
          <div>
            <p className="text-black font-semibold text-sm leading-none">{client.name}</p>
            <p className="text-black/30 text-xs mt-1">{client.username}</p>
          </div>
        </div>
        <ThreadMessages client={client} />
      </div>
    </FullScreenOverlay>
  );
}

export default function CoachMessages() {
  const { db } = useApp();
  const [search, setSearch] = useState("");
  const [openClientId, setOpenClientId] = useState(null);

  const clients = db.users
    .filter((u) => u.role === "client" && u.status === "active")
    .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    .map((c) => {
      const thread = db.messages[c.id] || [];
      const lastMsg = thread[thread.length - 1];
      return { ...c, lastMsg };
    })
    .sort((a, b) => (b.lastMsg?.date || 0) - (a.lastMsg?.date || 0));

  const openClient = clients.find((c) => c.id === openClientId) || db.users.find((u) => u.id === openClientId) || null;

  return (
    <div className="h-screen md:h-screen flex flex-col">
      <div className={`px-4 pt-5 pb-4 md:px-8 md:pt-8 shrink-0 ${openClientId ? "hidden md:block" : ""}`}>
        <h1 className="text-black text-2xl font-bold">Messages</h1>
        <p className="text-black/40 text-sm mt-0.5">Direct chat with your active clients</p>
      </div>

      <div className="flex-1 min-h-0 flex md:border-t border-black/8">
        <div className={`w-full md:w-80 shrink-0 md:border-r border-black/8 flex-col min-h-0 ${openClientId ? "hidden md:flex" : "flex"}`}>
          <div className="p-4">
            <div className="flex items-center gap-2 bg-black/5 rounded-xl px-3 py-2.5">
              <Search size={15} className="text-black/40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search clients"
                className="bg-transparent outline-none text-black text-sm flex-1 placeholder:text-black/30"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-4">
            {clients.length === 0 && (
              <p className="text-black/30 text-sm text-center py-10 px-4">
                <MessageCircle size={20} className="mx-auto mb-2 text-black/20" />
                No active clients to message yet.
              </p>
            )}
            {clients.map((c) => (
              <button
                key={c.id}
                onClick={() => setOpenClientId(c.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                  openClientId === c.id ? "bg-black/10" : "hover:bg-black/5"
                }`}
              >
                <Avatar name={c.name} url={c.avatarUrl} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-black font-semibold text-sm truncate">{c.name}</p>
                    {c.lastMsg && (
                      <span className="text-black/30 text-[11px] shrink-0 ml-2">
                        {new Date(c.lastMsg.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                  <p className="text-black/40 text-xs truncate mt-0.5">
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
              <div className="flex items-center gap-2 px-3 md:px-5 py-3 md:py-3.5 border-b border-black/8">
                <button
                  onClick={() => setOpenClientId(null)}
                  aria-label="Back to clients"
                  className="md:hidden w-8 h-8 -ml-1 flex items-center justify-center text-black/60 shrink-0"
                >
                  <ChevronLeft size={19} />
                </button>
                <Avatar name={openClient.name} url={openClient.avatarUrl} size={34} />
                <p className="text-black font-semibold text-sm">{openClient.name}</p>
              </div>
              <ThreadMessages client={openClient} />
            </>
          ) : (
            <div className="flex-1 flex-col items-center justify-center text-center hidden md:flex">
              <MessageCircle size={28} className="text-black/15 mb-3" />
              <p className="text-black/30 text-sm">Select a client to start messaging.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
