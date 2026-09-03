import React, { useState } from "react";
import { useApp, getCurrentPhase } from "../lib/AppContext";
import { Pill, BottomSheet, Field, TextInput, PrimaryButton, SecondaryButton, Avatar, ProgressBar } from "../components/ui";
import CoachClientDetail from "./CoachClientDetail";
import { UserPlus, Search, Copy, RefreshCw, Mail, Send } from "lucide-react";

export function inviteMailto({ email, name, username, code, coachName }) {
  const activateUrl = `${window.location.origin}/activate`;
  const subject = "Your Login Details For Zach McIvor Personal Training App";
  const body = [
    `Hey ${name.split(" ")[0]},`,
    "",
    "Welcome aboard — congrats on taking the first step! I'm genuinely excited to start working with you and help you smash your goals. 💪",
    "",
    "Here are your login details:",
    "",
    `Login email: ${username}`,
    `Invite code: ${code}`,
    "",
    `Activate your account here: ${activateUrl}`,
    "",
    "You'll choose your own password when you activate. Let's get to work!",
    "",
    coachName || "Zach",
  ].join("\n");
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Name + email only — creates the account immediately so the coach can build
// out the whole profile before the client ever knows it exists. Sending the
// actual login details is a separate, deliberate step from the profile.
function AddClientSheet({ open, onClose, onCreated }) {
  const { createInvite } = useApp();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  function close() {
    setName("");
    setEmail("");
    onClose();
  }

  function submit(e) {
    e.preventDefault();
    const created = createInvite({ name, email });
    setName("");
    setEmail("");
    onClose();
    onCreated(created.id);
  }

  return (
    <BottomSheet open={open} onClose={close} title="Add Client">
      <form onSubmit={submit} className="space-y-4">
        <Field label="FULL NAME">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Lee" required />
        </Field>
        <Field label="EMAIL">
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jordan@example.com" required />
        </Field>
        <PrimaryButton type="submit" className="w-full">
          <UserPlus size={18} /> CREATE CLIENT
        </PrimaryButton>
        <p className="text-black/30 text-xs text-center">
          You'll land on their profile next to set up their program and habits. Nothing is sent to them until you choose to.
        </p>
      </form>
    </BottomSheet>
  );
}

// On-demand reveal of login credentials — only reachable from the client's
// own profile, only visible to the coach, triggered whenever the coach is
// actually ready to bring the client in.
export function SendLoginSheet({ open, onClose, client, showToast }) {
  const { resendInvite, currentUser } = useApp();
  const [code, setCode] = useState(client?.password || "");

  if (!client) return null;

  function regenerate() {
    const newCode = resendInvite(client.id);
    setCode(newCode);
    showToast("New invite code generated");
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Send Login Details">
      <p className="text-black/50 text-sm mb-4">
        Only you can see this. Send it to {client.name.split(" ")[0]} however you like — they'll set their own password when
        they activate.
      </p>
      <div className="bg-black/5 border border-black/10 rounded-2xl p-4 space-y-3">
        <div>
          <p className="text-black/40 text-[11px] tracking-wide">LOGIN EMAIL</p>
          <p className="text-black text-lg font-bold">{client.username}</p>
        </div>
        <div>
          <p className="text-black/40 text-[11px] tracking-wide">INVITE CODE</p>
          <p className="text-black text-lg font-bold tracking-[0.3em]">{code}</p>
        </div>
      </div>
      <a
        href={inviteMailto({ email: client.email, name: client.name, username: client.username, code, coachName: currentUser?.name })}
        className="w-full mt-3 bg-black text-white text-sm font-bold py-3 rounded-xl flex items-center justify-center gap-2"
      >
        <Mail size={15} /> EMAIL THESE DETAILS
      </a>
      <button
        onClick={() => {
          const activateUrl = `${window.location.origin}/activate`;
          navigator.clipboard?.writeText(`Login email: ${client.username}\nInvite code: ${code}\nActivate at: ${activateUrl}`);
          showToast("Copied login details");
        }}
        className="w-full mt-2.5 bg-black/8 text-black text-sm font-semibold py-3 rounded-xl flex items-center justify-center gap-2"
      >
        <Copy size={14} /> COPY DETAILS
      </button>
      <SecondaryButton className="w-full mt-2.5" onClick={regenerate}>
        <RefreshCw size={15} /> GENERATE A NEW CODE
      </SecondaryButton>
    </BottomSheet>
  );
}

function PhaseCell({ phase }) {
  if (!phase) return <span className="text-black/30 text-sm">No phase scheduled</span>;
  const today = new Date().toISOString().slice(0, 10);
  const pct = (() => {
    if (!phase.endDate) return null;
    const start = new Date(phase.startDate).getTime();
    const end = new Date(phase.endDate).getTime();
    const now = new Date(today).getTime();
    if (end <= start) return 100;
    return Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100)));
  })();
  return (
    <div className="min-w-[160px]">
      <p className="text-black text-sm font-medium truncate">{phase.name}</p>
      <p className="text-black/35 text-xs mt-0.5">
        {phase.endDate ? `Ends ${new Date(phase.endDate).toLocaleDateString()}` : "No end date"}
      </p>
      {pct !== null && (
        <div className="mt-1.5 w-32">
          <ProgressBar value={pct} max={100} height={5} />
        </div>
      )}
    </div>
  );
}

export default function CoachClients({ showToast, search, setSearch }) {
  const { db } = useApp();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const q = (search || "").toLowerCase();
  const clients = db.users.filter((u) => u.role === "client" && u.name.toLowerCase().includes(q));

  return (
    <div className="max-w-6xl mx-auto px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-black text-2xl font-bold">Clients</h1>
          <p className="text-black/40 text-sm mt-0.5">{clients.length} total · access every client's full profile</p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 bg-black text-white text-sm font-bold px-4 py-2.5 rounded-xl"
        >
          <UserPlus size={16} /> ADD CLIENT
        </button>
      </div>

      <div className="flex items-center gap-2 bg-black/5 rounded-xl px-3.5 py-2.5 mb-5 max-w-sm">
        <Search size={15} className="text-black/40" />
        <input
          value={search || ""}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients"
          className="bg-transparent outline-none text-black text-sm flex-1 placeholder:text-black/30"
        />
      </div>

      <div className="border border-black/8 rounded-2xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-black/[0.03] border-b border-black/8">
              <th className="px-5 py-3 text-black/40 text-[11px] font-semibold tracking-wide">NAME</th>
              <th className="px-5 py-3 text-black/40 text-[11px] font-semibold tracking-wide">CURRENT PHASE</th>
              <th className="px-5 py-3 text-black/40 text-[11px] font-semibold tracking-wide">STATUS</th>
              <th className="px-5 py-3 text-black/40 text-[11px] font-semibold tracking-wide text-right">ACTION</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-black/40 text-sm">
                  No clients yet — add your first one to get started.
                </td>
              </tr>
            )}
            {clients.map((c) => {
              const phases = (db.clientPhases || {})[c.id] || [];
              const currentPhase = getCurrentPhase(phases, new Date().toISOString().slice(0, 10));
              return (
                <tr
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className="border-b border-black/5 last:border-0 hover:bg-black/[0.03] cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name} url={c.avatarUrl} size={38} />
                      <div className="min-w-0">
                        <p className="text-black font-semibold text-sm truncate">{c.name}</p>
                        <p className="text-black/35 text-xs truncate">{c.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <PhaseCell phase={currentPhase} />
                  </td>
                  <td className="px-5 py-3.5">
                    <Pill tone={c.status === "active" ? "outline" : "muted"}>{c.status === "active" ? "Active" : "Not sent yet"}</Pill>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(c.id);
                      }}
                      className="bg-black/8 hover:bg-black/15 text-black text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors"
                    >
                      OPEN
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AddClientSheet open={addOpen} onClose={() => setAddOpen(false)} onCreated={setSelectedId} />
      {selectedId && <CoachClientDetail clientId={selectedId} onClose={() => setSelectedId(null)} showToast={showToast} />}
    </div>
  );
}
