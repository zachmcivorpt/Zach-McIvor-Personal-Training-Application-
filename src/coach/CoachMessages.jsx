import React, { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/AppContext";
import { Card, FullScreenOverlay, ProgressBar, Avatar } from "../components/ui";
import { Search, Send, ChevronLeft, MessageCircle } from "lucide-react";

export function ThreadView({ client, onClose }) {
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
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[90] bg-[#0A0A0B] flex flex-col">
        <div className="flex items-center gap-3 px-5 pt-6 pb-3 border-b border-white/5">
          <button onClick={onClose} className="w-9 h-9 -ml-2 flex items-center justify-center text-white/60">
            <ChevronLeft size={20} />
          </button>
          <Avatar name={client.name} url={client.avatarUrl} size={36} />
          <div>
            <p className="text-white font-semibold text-sm leading-none">{client.name}</p>
            <p className="text-white/30 text-xs mt-1">@{client.username}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {thread.length === 0 && <p className="text-white/30 text-sm text-center py-10">No messages yet with {client.name.split(" ")[0]}.</p>}
          {thread.map((m) => (
            <div key={m.id} className={`flex ${m.from === "coach" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.from === "coach" ? "bg-white text-black" : "bg-white/8 text-white/85"}`}>
                <p>{m.text}</p>
                <p className={`text-[10px] mt-1 ${m.from === "coach" ? "text-black/40" : "text-white/30"}`}>
                  {new Date(m.date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div className="flex gap-2 px-5 pb-6 pt-2 border-t border-white/5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={`Message ${client.name.split(" ")[0]}...`}
            className="flex-1 bg-white/8 rounded-full px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
          />
          <button onClick={send} className="w-11 h-11 rounded-full bg-white flex items-center justify-center shrink-0">
            <Send size={16} className="text-black" />
          </button>
        </div>
      </div>
    </FullScreenOverlay>
  );
}

export default function CoachMessages() {
  const { db } = useApp();
  const [search, setSearch] = useState("");
  const [openClient, setOpenClient] = useState(null);

  const clients = db.users
    .filter((u) => u.role === "client" && u.status === "active")
    .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    .map((c) => {
      const thread = db.messages[c.id] || [];
      const lastMsg = thread[thread.length - 1];
      return { ...c, lastMsg };
    })
    .sort((a, b) => (b.lastMsg?.date || 0) - (a.lastMsg?.date || 0));

  return (
    <div className="px-5 pb-6 space-y-4">
      <div>
        <h1 className="text-white text-2xl font-bold">Messages</h1>
        <p className="text-white/40 text-sm mt-0.5">Direct chat with your active clients</p>
      </div>

      <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2.5">
        <Search size={16} className="text-white/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients"
          className="bg-transparent outline-none text-white text-sm flex-1 placeholder:text-white/30"
        />
      </div>

      <div className="space-y-2.5">
        {clients.length === 0 && (
          <Card>
            <p className="text-white/40 text-sm text-center py-6">
              <MessageCircle size={20} className="mx-auto mb-2 text-white/20" />
              No active clients to message yet.
            </p>
          </Card>
        )}
        {clients.map((c) => (
          <Card key={c.id} onClick={() => setOpenClient(c)}>
            <div className="flex items-center gap-3">
              <Avatar name={c.name} url={c.avatarUrl} size={44} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-white font-semibold text-sm truncate">{c.name}</p>
                  {c.lastMsg && (
                    <span className="text-white/30 text-[11px] shrink-0 ml-2">
                      {new Date(c.lastMsg.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  )}
                </div>
                <p className="text-white/40 text-xs truncate mt-0.5">
                  {c.lastMsg ? `${c.lastMsg.from === "coach" ? "You: " : ""}${c.lastMsg.text}` : "No messages yet"}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {openClient && <ThreadView client={openClient} onClose={() => setOpenClient(null)} />}
    </div>
  );
}
