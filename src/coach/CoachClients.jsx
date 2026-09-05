import React, { useState } from "react";
import { useApp, getCurrentPhase, getNextPhase } from "../lib/AppContext";
import { Pill, BottomSheet, Field, TextInput, PrimaryButton, SecondaryButton, DangerButton, Avatar, ProgressBar } from "../components/ui";
import CoachClientDetail from "./CoachClientDetail";
import { MEASURE_BLUE } from "../theme";
import { UserPlus, Search, Copy, RefreshCw, Mail, ChevronDown, MessageCircle, NotebookPen, Trash2, X, Repeat, Lock, Unlock } from "lucide-react";

export function inviteMailto({ email, name, username, code, coachName }) {
  const activateUrl = `${window.location.origin}/activate`;
  const subject = "Welcome to Zach McIvor Personal Training — Your Login Details";
  const body = [
    `Hi ${name.split(" ")[0]},`,
    "",
    "Welcome to Zach McIvor Personal Training!",
    "",
    "I've set you up on the training app, where you'll be able to access your personalised training program, workouts, track your progress, and keep everything in one place throughout your journey.",
    "",
    "Here are your login details:",
    "",
    `App: ${activateUrl}`,
    `Email: ${username}`,
    `Code: ${code}`,
    "",
    "When you get a chance, have a look through the app and familiarise yourself with everything. I'll be keeping your program updated and using the app to help keep you on track and progressing towards your goals.",
    "",
    "If you have any questions or have any trouble logging in, just reach out to me and I'll help you out.",
    "",
    "Looking forward to working with you and seeing what we can achieve together!",
    "",
    "Cheers,",
    coachName || "Zach McIvor",
    "Zach McIvor Personal Training",
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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function close() {
    setName("");
    setEmail("");
    setError("");
    onClose();
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const created = await createInvite({ name, email });
      setName("");
      setEmail("");
      onClose();
      onCreated(created.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
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
        {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">{error}</p>}
        <PrimaryButton type="submit" className="w-full" disabled={busy}>
          <UserPlus size={18} /> {busy ? "CREATING…" : "CREATE CLIENT"}
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
        Only you can see this. Send it to {client.name?.split(" ")[0] || "them"} however you like — they'll set their own password when
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
          navigator.clipboard?.writeText(`App: ${activateUrl}\nEmail: ${client.username}\nCode: ${code}`);
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
    <div className="min-w-[135px]">
      <p className="text-black text-sm font-medium truncate">{phase.name}</p>
      <p className="text-black/35 text-xs mt-0.5">
        {phase.endDate ? `Ends ${new Date(phase.endDate).toLocaleDateString()}` : "No end date"}
      </p>
      {pct !== null && (
        <div className="mt-1.5 w-28">
          <ProgressBar value={pct} max={100} height={5} color={MEASURE_BLUE} />
        </div>
      )}
    </div>
  );
}

function NextPhaseCell({ phase }) {
  if (!phase) return <span className="text-black/25 text-sm">—</span>;
  return (
    <div className="min-w-[115px]">
      <p className="text-black/70 text-sm font-medium truncate">{phase.name}</p>
      <p className="text-black/35 text-xs mt-0.5">Starts {new Date(phase.startDate).toLocaleDateString()}</p>
    </div>
  );
}

// "Jacob's program" — a simple derived label rather than a stored field;
// this app doesn't model a separate Program entity above the phase
// timeline, so the umbrella name is just the client's own possessive.
function mainProgramLabel(client) {
  if (!client.name) return "Their program";
  const first = client.name.split(" ")[0];
  return `${first}${first.endsWith("s") ? "'" : "'s"} program`;
}

// Small icon+count chips showing what needs the coach's attention for this
// client — mirrors the same "awaiting reply" / "unread check-in" signals
// already surfaced in aggregate on the Overview dashboard, just per-row.
function EngagementBadges({ awaitingReply, pendingCheckins }) {
  if (!awaitingReply && !pendingCheckins) return <span className="text-black/20 text-xs">—</span>;
  return (
    <div className="flex items-center gap-1.5">
      {awaitingReply && (
        <span className="flex items-center gap-1 bg-blue-50 text-blue-600 text-[11px] font-bold px-1.5 py-1 rounded-md">
          <MessageCircle size={11} /> 1
        </span>
      )}
      {pendingCheckins > 0 && (
        <span className="flex items-center gap-1 bg-amber-50 text-amber-600 text-[11px] font-bold px-1.5 py-1 rounded-md">
          <NotebookPen size={11} /> {pendingCheckins}
        </span>
      )}
    </div>
  );
}

// OPEN ▾ row action — the primary "open" action plus a small dropdown for
// the one other thing you'd do from the roster itself: remove a client.
function RowActions({ onOpen, onRemove, paused, onTogglePause }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex justify-end" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-stretch rounded-lg overflow-hidden border border-black/10">
        <button onClick={onOpen} className="bg-black/8 hover:bg-black/15 text-black text-xs font-semibold px-3.5 py-2 transition-colors">
          OPEN
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          className="bg-black/8 hover:bg-black/15 text-black/50 px-2 border-l border-black/10 transition-colors"
        >
          <ChevronDown size={13} />
        </button>
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-black/10 rounded-xl shadow-lg overflow-hidden w-48">
            {onTogglePause && (
              <button
                onClick={() => {
                  setOpen(false);
                  onTogglePause();
                }}
                className="w-full flex items-center gap-2 px-3.5 py-2.5 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
              >
                {paused ? (
                  <>
                    <Unlock size={13} /> Resume access
                  </>
                ) : (
                  <>
                    <Lock size={13} /> Pause access
                  </>
                )}
              </button>
            )}
            <button
              onClick={() => {
                setOpen(false);
                onRemove();
              }}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
            >
              <Trash2 size={13} /> Remove client
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function CoachClients({ showToast, search, setSearch }) {
  const { db, removeClient, startViewAsClient, setClientAccessPaused, dbReady } = useApp();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [checkedIds, setCheckedIds] = useState(() => new Set());
  const [confirmRemove, setConfirmRemove] = useState(false);
  const q = (search || "").toLowerCase();
  const clients = db.users.filter((u) => u.role === "client" && u.name.toLowerCase().includes(q));
  const today = new Date().toISOString().slice(0, 10);

  function toggleChecked(id) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function bulkRemove() {
    checkedIds.forEach((id) => removeClient(id));
    showToast(`Removed ${checkedIds.size} client${checkedIds.size === 1 ? "" : "s"}`);
    setCheckedIds(new Set());
    setConfirmRemove(false);
  }

  function rowData(c) {
    const phases = (db.clientPhases || {})[c.id] || [];
    const currentPhase = getCurrentPhase(phases, today);
    const nextPhase = getNextPhase(phases, today);
    const thread = db.messages[c.id] || [];
    const lastMsg = thread[thread.length - 1];
    const awaitingReply = !!(lastMsg && lastMsg.from === "client");
    const pendingCheckins = ((db.formResponses || {})[c.id] || []).filter((r) => r.read === false).length;
    return { currentPhase, nextPhase, awaitingReply, pendingCheckins };
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-5 md:px-8 md:py-8">
      {checkedIds.size > 0 ? (
        <div className="flex items-center justify-between gap-3 mb-6 bg-black text-white rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setCheckedIds(new Set())} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10">
              <X size={14} />
            </button>
            <p className="text-sm font-semibold">{checkedIds.size} selected</p>
          </div>
          <button
            onClick={() => setConfirmRemove(true)}
            className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition-colors"
          >
            <Trash2 size={13} /> REMOVE
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="min-w-0">
            <h1 className="text-black text-2xl font-bold">Clients</h1>
            <p className="text-black/40 text-sm mt-0.5 truncate">{clients.length} total · access every client's full profile</p>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            aria-label="Add client"
            className="flex items-center gap-2 bg-black text-white text-sm font-bold px-4 py-2.5 rounded-xl shrink-0"
          >
            <UserPlus size={16} /> <span className="hidden sm:inline">ADD CLIENT</span>
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 bg-black/5 rounded-xl px-3.5 py-2.5 mb-5 md:max-w-sm">
        <Search size={15} className="text-black/40" />
        <input
          value={search || ""}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients"
          className="bg-transparent outline-none text-black text-sm flex-1 placeholder:text-black/30"
        />
      </div>

      {/* desktop table — horizontally scrollable on any viewport narrower than
          its min-width, with momentum scrolling on iOS Safari so a swipe
          actually glides instead of just nudging a pixel at a time */}
      <div className="hidden md:block border border-black/8 rounded-2xl overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
        <table className="w-full min-w-[1080px] text-left border-collapse">
          <thead>
            <tr className="bg-black/[0.03] border-b border-black/8">
              <th className="w-10 px-3 py-3" />
              <th className="px-2 py-3 text-black/40 text-[11px] font-semibold tracking-wide">NAME</th>
              <th className="px-3 py-3 text-black/40 text-[11px] font-semibold tracking-wide">MAIN PROGRAM</th>
              <th className="px-3 py-3 text-black/40 text-[11px] font-semibold tracking-wide">CURRENT PHASE</th>
              <th className="px-3 py-3 text-black/40 text-[11px] font-semibold tracking-wide">NEXT PHASE</th>
              <th className="px-3 py-3 text-black/40 text-[11px] font-semibold tracking-wide">ENGAGEMENT</th>
              <th className="px-3 py-3 text-black/40 text-[11px] font-semibold tracking-wide">STATUS</th>
              <th className="px-3 py-3 text-black/40 text-[11px] font-semibold tracking-wide text-right">ACTION</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-black/40 text-sm">
                  {dbReady ? "No clients yet — add your first one to get started." : "Loading your clients…"}
                </td>
              </tr>
            )}
            {clients.map((c) => {
              const { currentPhase, nextPhase, awaitingReply, pendingCheckins } = rowData(c);
              return (
                <tr
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`border-b border-black/5 last:border-0 hover:bg-black/[0.03] cursor-pointer transition-colors ${
                    checkedIds.has(c.id) ? "bg-blue-50/50" : ""
                  }`}
                >
                  <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checkedIds.has(c.id)}
                      onChange={() => toggleChecked(c.id)}
                      className="w-4 h-4 rounded accent-black cursor-pointer"
                    />
                  </td>
                  <td className="px-2 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={c.name} url={c.avatarUrl} size={36} />
                      <div className="min-w-0">
                        <p className="text-black font-semibold text-sm truncate">{c.name}</p>
                        <p className="text-black/35 text-xs truncate">{c.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    <span className="text-black/60 text-sm">{mainProgramLabel(c)}</span>
                  </td>
                  <td className="px-3 py-3.5">
                    <PhaseCell phase={currentPhase} />
                  </td>
                  <td className="px-3 py-3.5">
                    <NextPhaseCell phase={nextPhase} />
                  </td>
                  <td className="px-3 py-3.5">
                    <EngagementBadges awaitingReply={awaitingReply} pendingCheckins={pendingCheckins} />
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <Pill tone={c.status === "active" ? "outline" : "muted"}>{c.status === "active" ? "Active" : "Not sent yet"}</Pill>
                      {c.accessPaused && <Pill tone="warning">Paused</Pill>}
                    </div>
                  </td>
                  <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      {c.status === "active" && (
                        <button
                          onClick={() => startViewAsClient(c.id)}
                          title="Browse and act in the app exactly as this client"
                          aria-label={`View as ${c.name}`}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors shrink-0"
                        >
                          <Repeat size={14} />
                        </button>
                      )}
                      <RowActions
                        onOpen={() => setSelectedId(c.id)}
                        onRemove={() => removeClient(c.id)}
                        paused={!!c.accessPaused}
                        onTogglePause={
                          c.status === "active" ? () => setClientAccessPaused(c.id, !c.accessPaused) : undefined
                        }
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* mobile card list */}
      <div className="md:hidden space-y-2.5">
        {clients.length === 0 && (
          <div className="border border-black/8 rounded-2xl px-5 py-10 text-center text-black/40 text-sm">
            {dbReady ? "No clients yet — add your first one to get started." : "Loading your clients…"}
          </div>
        )}
        {clients.map((c) => {
          const { currentPhase, nextPhase, awaitingReply, pendingCheckins } = rowData(c);
          return (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedId(c.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelectedId(c.id)}
              className="w-full text-left border border-black/8 rounded-2xl p-4 active:bg-black/[0.03] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  checked={checkedIds.has(c.id)}
                  onChange={() => toggleChecked(c.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 rounded accent-black cursor-pointer shrink-0"
                />
                <Avatar name={c.name} url={c.avatarUrl} size={42} />
                <div className="min-w-0 flex-1">
                  <p className="text-black font-semibold text-sm truncate">{c.name}</p>
                  <p className="text-black/35 text-xs truncate">{mainProgramLabel(c)}</p>
                </div>
                {c.status === "active" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startViewAsClient(c.id);
                    }}
                    title="Browse and act in the app exactly as this client"
                    aria-label={`View as ${c.name}`}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-50 text-blue-700 shrink-0"
                  >
                    <Repeat size={14} />
                  </button>
                )}
                {c.status === "active" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setClientAccessPaused(c.id, !c.accessPaused);
                    }}
                    title={c.accessPaused ? "Resume access" : "Pause access (e.g. insufficient payment)"}
                    aria-label={c.accessPaused ? `Resume access for ${c.name}` : `Pause access for ${c.name}`}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg shrink-0 ${
                      c.accessPaused ? "bg-red-50 text-red-700" : "bg-black/5 text-black/40"
                    }`}
                  >
                    {c.accessPaused ? <Unlock size={14} /> : <Lock size={14} />}
                  </button>
                )}
                <Pill tone={c.status === "active" ? "outline" : "muted"}>{c.status === "active" ? "Active" : "Not sent yet"}</Pill>
              </div>
              {c.accessPaused && (
                <p className="flex items-center gap-1 text-red-700 text-xs font-medium mb-2.5">
                  <Lock size={11} /> Access paused
                </p>
              )}
              <div className="flex items-center justify-between gap-3">
                <PhaseCell phase={currentPhase} />
                <EngagementBadges awaitingReply={awaitingReply} pendingCheckins={pendingCheckins} />
              </div>
              {nextPhase && (
                <p className="text-black/30 text-xs mt-2 pt-2 border-t border-black/5">
                  Next: {nextPhase.name} · starts {new Date(nextPhase.startDate).toLocaleDateString()}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <AddClientSheet open={addOpen} onClose={() => setAddOpen(false)} onCreated={setSelectedId} />
      {selectedId && <CoachClientDetail clientId={selectedId} onClose={() => setSelectedId(null)} showToast={showToast} />}

      <BottomSheet open={confirmRemove} onClose={() => setConfirmRemove(false)} title="Remove selected clients?">
        <p className="text-black/50 text-sm mb-4">
          This permanently deletes {checkedIds.size} client{checkedIds.size === 1 ? "" : "s"} and all their workout history,
          messages, and progress data. This can't be undone.
        </p>
        <DangerButton className="w-full" onClick={bulkRemove}>
          <Trash2 size={14} /> Remove {checkedIds.size} client{checkedIds.size === 1 ? "" : "s"}
        </DangerButton>
      </BottomSheet>
    </div>
  );
}
