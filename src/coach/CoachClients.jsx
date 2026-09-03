import React, { useState } from "react";
import { useApp } from "../lib/AppContext";
import { Card, Pill, BottomSheet, Field, TextInput, Select, PrimaryButton, SecondaryButton, DangerButton } from "../components/ui";
import { UserPlus, ChevronRight, Copy, RefreshCw, Trash2, ClipboardList } from "lucide-react";

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
          <button
            onClick={() => {
              navigator.clipboard?.writeText(`Username: ${result.username}\nInvite code: ${result.code}\nActivate at your app's /activate page.`);
              showToast("Copied login details");
            }}
            className="w-full mt-3 bg-white/8 text-white text-sm font-semibold py-3 rounded-xl flex items-center justify-center gap-2"
          >
            <Copy size={14} /> COPY DETAILS
          </button>
          <PrimaryButton onClick={close} className="w-full mt-3">
            DONE
          </PrimaryButton>
        </div>
      )}
    </BottomSheet>
  );
}

function ClientDetailSheet({ client, open, onClose, showToast }) {
  const { db, assignProgram, resendInvite, removeClient } = useApp();
  const [confirmRemove, setConfirmRemove] = useState(false);
  if (!client) return null;
  const program = db.programs.find((p) => p.id === client.assignedProgramId);
  const logs = db.workoutLogs[client.id] || [];

  return (
    <BottomSheet open={open} onClose={onClose} title={client.name}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-lg font-bold text-white">
          {client.name[0]}
        </div>
        <div>
          <p className="text-white font-semibold">{client.name}</p>
          <p className="text-white/40 text-xs">{client.email}</p>
        </div>
        <Pill tone={client.status === "active" ? "outline" : "muted"}>{client.status === "active" ? "Active" : "Invited"}</Pill>
      </div>

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
        <div className="flex items-center gap-2 mt-3 text-white/40 text-xs">
          <ClipboardList size={13} /> {program.weeks.reduce((a, w) => a + w.days.length, 0)} sessions · {program.level}
        </div>
      )}

      <div className="mt-5 pt-5 border-t border-white/5">
        <p className="text-white/40 text-xs tracking-wide mb-2">TRAINING LOG</p>
        {logs.length === 0 ? (
          <p className="text-white/30 text-sm">No workouts logged yet.</p>
        ) : (
          <div className="space-y-2">
            {logs.slice(0, 5).map((l) => (
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
          className="w-full mt-5"
          onClick={() => {
            const code = resendInvite(client.id);
            showToast(`New invite code: ${code}`);
          }}
        >
          <RefreshCw size={16} /> REGENERATE INVITE CODE
        </SecondaryButton>
      )}

      <div className="mt-3">
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
    </BottomSheet>
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
          <p className="text-white/40 text-sm mt-0.5">{clients.length} total</p>
        </div>
        <button onClick={() => setInviteOpen(true)} className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center">
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
          return (
            <Card key={c.id} onClick={() => setSelected(c)}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold text-white shrink-0">
                  {c.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{c.name}</p>
                  <p className="text-white/40 text-xs truncate mt-0.5">{program ? program.name : "No program assigned"}</p>
                </div>
                <Pill tone={c.status === "active" ? "outline" : "muted"}>{c.status === "active" ? "Active" : "Invited"}</Pill>
                <ChevronRight size={16} className="text-white/20" />
              </div>
            </Card>
          );
        })}
      </div>

      <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} showToast={showToast} />
      <ClientDetailSheet client={selected} open={!!selected} onClose={() => setSelected(null)} showToast={showToast} />
    </div>
  );
}
