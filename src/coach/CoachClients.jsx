import React, { useState } from "react";
import { useApp } from "../lib/AppContext";
import {
  Card,
  Pill,
  BottomSheet,
  Field,
  TextInput,
  Select,
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  FullScreenOverlay,
} from "../components/ui";
import { ThreadView } from "./CoachMessages";
import {
  UserPlus,
  ChevronRight,
  ChevronLeft,
  Copy,
  RefreshCw,
  Trash2,
  ClipboardList,
  MessageCircle,
  Image as ImageIcon,
  Mail,
  Send,
  Plus,
  ListChecks,
} from "lucide-react";

const HABIT_PRESETS = ["12,000 steps", "Do your Mobility", "Log your Nutrition", "Sleep 7+ Hours"];

function inviteMailto({ email, name, username, code }) {
  const activateUrl = `${window.location.origin}/activate`;
  const subject = "Your login for M Personal Training";
  const body = [
    `Hey ${name.split(" ")[0]},`,
    "",
    "Here are your login details to activate your account:",
    "",
    `Username: ${username}`,
    `Invite code: ${code}`,
    "",
    `Activate your account here: ${activateUrl}`,
    "",
    "You'll set your own password when you activate — see you in there!",
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
        <p className="text-white/30 text-xs text-center">
          You'll land on their profile next to set up their program and habits. Nothing is sent to them until you choose to.
        </p>
      </form>
    </BottomSheet>
  );
}

// On-demand reveal of login credentials — only reachable from the client's
// own profile, only visible to the coach, triggered whenever the coach is
// actually ready to bring the client in.
function SendLoginSheet({ open, onClose, client, showToast }) {
  const { resendInvite } = useApp();
  const [code, setCode] = useState(client?.password || "");

  if (!client) return null;

  function regenerate() {
    const newCode = resendInvite(client.id);
    setCode(newCode);
    showToast("New invite code generated");
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Send Login Details">
      <p className="text-white/50 text-sm mb-4">
        Only you can see this. Send it to {client.name.split(" ")[0]} however you like — they'll set their own password when
        they activate.
      </p>
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
        <div>
          <p className="text-white/40 text-[11px] tracking-wide">USERNAME</p>
          <p className="text-white text-lg font-bold">{client.username}</p>
        </div>
        <div>
          <p className="text-white/40 text-[11px] tracking-wide">INVITE CODE</p>
          <p className="text-white text-lg font-bold tracking-[0.3em]">{code}</p>
        </div>
      </div>
      <a
        href={inviteMailto({ email: client.email, name: client.name, username: client.username, code })}
        className="w-full mt-3 bg-white text-black text-sm font-bold py-3 rounded-xl flex items-center justify-center gap-2"
      >
        <Mail size={15} /> EMAIL THESE DETAILS
      </a>
      <button
        onClick={() => {
          const activateUrl = `${window.location.origin}/activate`;
          navigator.clipboard?.writeText(`Username: ${client.username}\nInvite code: ${code}\nActivate at: ${activateUrl}`);
          showToast("Copied login details");
        }}
        className="w-full mt-2.5 bg-white/8 text-white text-sm font-semibold py-3 rounded-xl flex items-center justify-center gap-2"
      >
        <Copy size={14} /> COPY DETAILS
      </button>
      <SecondaryButton className="w-full mt-2.5" onClick={regenerate}>
        <RefreshCw size={15} /> GENERATE A NEW CODE
      </SecondaryButton>
    </BottomSheet>
  );
}

function HabitsSection({ clientId }) {
  const { db, addHabit, removeHabit } = useApp();
  const [label, setLabel] = useState("");
  const habits = (db.habits || {})[clientId] || [];
  const existingLabels = new Set(habits.map((h) => h.label.toLowerCase()));

  function submit(e) {
    e.preventDefault();
    if (!label.trim()) return;
    addHabit(clientId, label);
    setLabel("");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-white/40 text-xs tracking-wide">DAILY HABITS</p>
        <ListChecks size={14} className="text-white/25" />
      </div>

      {habits.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {habits.map((h) => (
            <div key={h.id} className="flex items-center justify-between bg-white/5 rounded-xl px-3.5 py-2.5">
              <span className="text-white text-sm">{h.label}</span>
              <button onClick={() => removeHabit(clientId, h.id)} className="w-7 h-7 flex items-center justify-center text-white/30">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="flex gap-2 mb-2.5">
        <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Stretch for 10 minutes" className="flex-1" />
        <button type="submit" className="w-11 h-11 shrink-0 rounded-xl bg-white text-black flex items-center justify-center">
          <Plus size={18} />
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {HABIT_PRESETS.filter((p) => !existingLabels.has(p.toLowerCase())).map((preset) => (
          <button
            key={preset}
            onClick={() => addHabit(clientId, preset)}
            className="text-xs bg-white/8 text-white/60 px-3 py-1.5 rounded-full"
          >
            + {preset}
          </button>
        ))}
      </div>
    </div>
  );
}

function ClientProfile({ clientId, onClose, showToast }) {
  const { db, assignProgram, removeClient } = useApp();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  const client = db.users.find((u) => u.id === clientId);
  if (!client) return null;

  const program = db.programs.find((p) => p.id === client.assignedProgramId);
  const logs = db.workoutLogs[client.id] || [];
  const photos = db.progressPhotos[client.id] || [];

  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[90] bg-[#0A0A0B] flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-6 pb-3 sticky top-0 bg-[#0A0A0B] z-10 border-b border-white/5">
          <button onClick={onClose} className="w-9 h-9 -ml-2 flex items-center justify-center text-white/60">
            <ChevronLeft size={20} />
          </button>
          <span className="text-white font-semibold">Client Profile</span>
          {client.status !== "active" ? (
            <button onClick={() => setSendOpen(true)} className="w-9 h-9 flex items-center justify-center text-white/60" title="Send login details">
              <Send size={18} />
            </button>
          ) : (
            <div className="w-9" />
          )}
        </div>

        <div className="px-5 py-5 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-xl font-bold text-white shrink-0">
              {client.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-lg truncate">{client.name}</p>
              <p className="text-white/40 text-xs truncate">{client.email}</p>
            </div>
            <Pill tone={client.status === "active" ? "outline" : "muted"}>{client.status === "active" ? "Active" : "Not sent yet"}</Pill>
          </div>

          {client.status === "active" ? (
            <PrimaryButton className="w-full" onClick={() => setMessaging(true)}>
              <MessageCircle size={16} /> MESSAGE {client.name.split(" ")[0].toUpperCase()}
            </PrimaryButton>
          ) : (
            <PrimaryButton className="w-full" onClick={() => setSendOpen(true)}>
              <Send size={16} /> SEND LOGIN DETAILS
            </PrimaryButton>
          )}

          <Field label="ASSIGNED PROGRAM">
            <Select value={client.assignedProgramId || ""} onChange={(e) => assignProgram(client.id, e.target.value || null)}>
              <option value="">— No program —</option>
              {db.programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          {program && (
            <div className="flex items-center gap-2 -mt-3 text-white/40 text-xs">
              <ClipboardList size={13} /> {program.weeks.reduce((a, w) => a + w.days.length, 0)} sessions · {program.level}
            </div>
          )}

          <HabitsSection clientId={client.id} />

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-white/40 text-xs tracking-wide">PROGRESS PHOTOS</p>
              <ImageIcon size={14} className="text-white/25" />
            </div>
            {photos.length === 0 ? (
              <p className="text-white/25 text-sm">No photos uploaded by this client yet.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {photos.slice(0, 8).map((p) => (
                  <div key={p.id} className="aspect-square rounded-lg overflow-hidden bg-white/5">
                    <img src={p.url} alt="Progress" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-white/40 text-xs tracking-wide mb-2">TRAINING LOG</p>
            {logs.length === 0 ? (
              <p className="text-white/30 text-sm">No workouts logged yet.</p>
            ) : (
              <div className="space-y-2">
                {logs.slice(0, 6).map((l) => (
                  <div key={l.id} className="flex items-center justify-between text-sm">
                    <span className="text-white/70">{l.dayLabel}</span>
                    <span className="text-white/40">{new Date(l.date).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2">
            {!confirmRemove ? (
              <DangerButton className="w-full" onClick={() => setConfirmRemove(true)}>
                <Trash2 size={14} /> Remove client
              </DangerButton>
            ) : (
              <div className="flex gap-2">
                <SecondaryButton className="flex-1" onClick={() => setConfirmRemove(false)}>
                  Cancel
                </SecondaryButton>
                <DangerButton
                  className="flex-1"
                  onClick={() => {
                    removeClient(client.id);
                    onClose();
                    showToast("Client removed");
                  }}
                >
                  Confirm remove
                </DangerButton>
              </div>
            )}
          </div>
        </div>
      </div>
      {messaging && <ThreadView client={client} onClose={() => setMessaging(false)} />}
      <SendLoginSheet open={sendOpen} onClose={() => setSendOpen(false)} client={client} showToast={showToast} />
    </FullScreenOverlay>
  );
}

export default function CoachClients({ showToast }) {
  const { db } = useApp();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const clients = db.users.filter((u) => u.role === "client");

  return (
    <div className="px-5 pb-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Clients</h1>
          <p className="text-white/40 text-sm mt-0.5">{clients.length} total · access every client's full profile</p>
        </div>
        <button onClick={() => setAddOpen(true)} className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center shrink-0">
          <UserPlus size={18} />
        </button>
      </div>

      <div className="space-y-2.5">
        {clients.length === 0 && (
          <Card>
            <p className="text-white/40 text-sm text-center py-6">No clients yet — add your first one to get started.</p>
          </Card>
        )}
        {clients.map((c) => {
          const program = db.programs.find((p) => p.id === c.assignedProgramId);
          const logs = db.workoutLogs[c.id] || [];
          const lastWorkout = logs[0];
          return (
            <Card key={c.id} onClick={() => setSelectedId(c.id)}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold text-white shrink-0">
                  {c.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{c.name}</p>
                  <p className="text-white/40 text-xs truncate mt-0.5">
                    {lastWorkout ? `Last workout ${new Date(lastWorkout.date).toLocaleDateString()}` : program ? program.name : "No program assigned"}
                  </p>
                </div>
                <Pill tone={c.status === "active" ? "outline" : "muted"}>{c.status === "active" ? "Active" : "Not sent yet"}</Pill>
                <ChevronRight size={16} className="text-white/20" />
              </div>
            </Card>
          );
        })}
      </div>

      <AddClientSheet open={addOpen} onClose={() => setAddOpen(false)} onCreated={setSelectedId} />
      {selectedId && <ClientProfile clientId={selectedId} onClose={() => setSelectedId(null)} showToast={showToast} />}
    </div>
  );
}
