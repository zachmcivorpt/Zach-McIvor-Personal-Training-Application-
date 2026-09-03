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
} from "lucide-react";

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

function InviteSheet({ open, onClose, showToast }) {
  const { createInvite } = useApp();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState(null);

  function submit(e) {
    e.preventDefault();
    const credentials = createInvite({ name, email });
    setResult(credentials);
  }

  function close() {
    setName("");
    setEmail("");
    setResult(null);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={close} title="Invite Client">
      {!result ? (
        <form onSubmit={submit} className="space-y-4">
          <Field label="FULL NAME">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Lee" required />
          </Field>
          <Field label="EMAIL">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jordan@example.com" required />
          </Field>
          <PrimaryButton type="submit" className="w-full">
            <UserPlus size={18} /> GENERATE INVITE
          </PrimaryButton>
        </form>
      ) : (
        <div>
          <p className="text-white/50 text-sm mb-4">
            Share these login details with {name.split(" ")[0]} however you normally message clients. They'll set their own
            password when they activate.
          </p>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
            <div>
              <p className="text-white/40 text-[11px] tracking-wide">USERNAME</p>
              <p className="text-white text-lg font-bold">{result.username}</p>
            </div>
            <div>
              <p className="text-white/40 text-[11px] tracking-wide">INVITE CODE</p>
              <p className="text-white text-lg font-bold tracking-[0.3em]">{result.code}</p>
            </div>
          </div>
          <a
            href={inviteMailto({ email, name, username: result.username, code: result.code })}
            className="w-full mt-3 bg-white text-black text-sm font-bold py-3 rounded-xl flex items-center justify-center gap-2"
          >
            <Mail size={15} /> EMAIL THESE DETAILS
          </a>
          <button
            onClick={() => {
              const activateUrl = `${window.location.origin}/activate`;
              navigator.clipboard?.writeText(
                `Username: ${result.username}\nInvite code: ${result.code}\nActivate at: ${activateUrl}`
              );
              showToast("Copied login details");
            }}
            className="w-full mt-2.5 bg-white/8 text-white text-sm font-semibold py-3 rounded-xl flex items-center justify-center gap-2"
          >
            <Copy size={14} /> COPY DETAILS
          </button>
          <PrimaryButton onClick={close} className="w-full mt-3 !bg-white/8 !text-white">
            DONE
          </PrimaryButton>
        </div>
      )}
    </BottomSheet>
  );
}

function ClientProfile({ client, onClose, showToast }) {
  const { db, assignProgram, resendInvite, removeClient } = useApp();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [messaging, setMessaging] = useState(false);
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
          <div className="w-9" />
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
            <Pill tone={client.status === "active" ? "outline" : "muted"}>{client.status === "active" ? "Active" : "Invited"}</Pill>
          </div>

          {client.status === "active" && (
            <PrimaryButton className="w-full" onClick={() => setMessaging(true)}>
              <MessageCircle size={16} /> MESSAGE {client.name.split(" ")[0].toUpperCase()}
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

          {client.status === "invited" && (
            <SecondaryButton
              className="w-full"
              onClick={() => {
                const code = resendInvite(client.id);
                showToast(`New invite code: ${code}`);
              }}
            >
              <RefreshCw size={16} /> REGENERATE INVITE CODE
            </SecondaryButton>
          )}

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
    </FullScreenOverlay>
  );
}

export default function CoachClients({ showToast }) {
  const { db } = useApp();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const clients = db.users.filter((u) => u.role === "client");

  return (
    <div className="px-5 pb-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Clients</h1>
          <p className="text-white/40 text-sm mt-0.5">{clients.length} total · access every client's full profile</p>
        </div>
        <button onClick={() => setInviteOpen(true)} className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center shrink-0">
          <UserPlus size={18} />
        </button>
      </div>

      <div className="space-y-2.5">
        {clients.length === 0 && (
          <Card>
            <p className="text-white/40 text-sm text-center py-6">No clients yet — invite your first one to get started.</p>
          </Card>
        )}
        {clients.map((c) => {
          const program = db.programs.find((p) => p.id === c.assignedProgramId);
          const logs = db.workoutLogs[c.id] || [];
          const lastWorkout = logs[0];
          return (
            <Card key={c.id} onClick={() => setSelected(c)}>
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
                <Pill tone={c.status === "active" ? "outline" : "muted"}>{c.status === "active" ? "Active" : "Invited"}</Pill>
                <ChevronRight size={16} className="text-white/20" />
              </div>
            </Card>
          );
        })}
      </div>

      <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} showToast={showToast} />
      {selected && <ClientProfile client={selected} onClose={() => setSelected(null)} showToast={showToast} />}
    </div>
  );
}
