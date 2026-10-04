import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, getCurrentPhase, getNextPhase, needsNewPhaseSoon } from "../lib/AppContext";
import { localDateKey } from "../lib/dateKey";
import { Pill, BottomSheet, Field, TextInput, PrimaryButton, SecondaryButton, DangerButton, Avatar, ProgressBar } from "../components/ui";
import CoachClientDetail from "./CoachClientDetail";
import { MEASURE_BLUE, CLIENT_DARK_SURFACE, CLIENT_DARK_SURFACE_2, CLIENT_DARK_BORDER, OVER_RED } from "../theme";
import { DarkPage, DarkPanel, DarkPageHeader } from "./darkUI";
import { UserPlus, Search, Copy, RefreshCw, Mail, ChevronDown, MessageCircle, NotebookPen, Trash2, X, Repeat, Lock, Unlock, AlertTriangle } from "lucide-react";

const APP_STORE_URL = "https://apps.apple.com/app/id6810194114";

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
    `First, download the app from the App Store: ${APP_STORE_URL}`,
    "",
    "Once it's installed, open it and tap \"Activate your account\" on the login screen, then enter these details:",
    "",
    `Email: ${username}`,
    `Code: ${code}`,
    "",
    `(Prefer to activate from a browser first? You can also use: ${activateUrl})`,
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
  const { createInvite, restoreClientProfile } = useApp();
  const [mode, setMode] = useState("new"); // new | restore
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [uid, setUid] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function close() {
    setMode("new");
    setName("");
    setEmail("");
    setUid("");
    setError("");
    onClose();
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "restore") {
        await restoreClientProfile(uid, { name, email });
        const restoredId = uid.trim();
        setName("");
        setEmail("");
        setUid("");
        onClose();
        onCreated(restoredId);
      } else {
        const created = await createInvite({ name, email });
        setName("");
        setEmail("");
        onClose();
        onCreated(created.id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={close} title={mode === "restore" ? "Restore an Account" : "Add Client"}>
      <div className="flex bg-black/5 rounded-xl p-1 mb-4">
        {[
          { id: "new", label: "New Client" },
          { id: "restore", label: "Restore Account" },
        ].map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              setMode(m.id);
              setError("");
            }}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
              mode === m.id ? "bg-white shadow text-black" : "text-black/50"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4">
        {mode === "restore" && (
          <>
            <p className="text-black/40 text-xs -mt-1">
              For a client whose login still works but whose profile went missing — paste the account ID they see on their
              own sign-in screen when this happens.
            </p>
            <Field label="ACCOUNT ID">
              <TextInput value={uid} onChange={(e) => setUid(e.target.value)} placeholder="e.g. Ax7fP2qL9mZ..." required />
            </Field>
          </>
        )}
        <Field label="FULL NAME">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Lee" required />
        </Field>
        <Field label="EMAIL">
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jordan@example.com" required />
        </Field>
        {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">{error}</p>}
        <PrimaryButton type="submit" className="w-full" disabled={busy}>
          <UserPlus size={18} /> {busy ? (mode === "restore" ? "RESTORING…" : "CREATING…") : mode === "restore" ? "RESTORE PROFILE" : "CREATE CLIENT"}
        </PrimaryButton>
        <p className="text-black/30 text-xs text-center">
          {mode === "restore"
            ? "Reconnects their existing login to a fresh profile — no new account, and their email must already match."
            : "You'll land on their profile next to set up their program and habits. Nothing is sent to them until you choose to."}
        </p>
      </form>
    </BottomSheet>
  );
}

// On-demand reveal of login credentials — only reachable from the client's
// own profile, only visible to the coach, triggered whenever the coach is
// actually ready to bring the client in.
export function SendLoginSheet({ open, onClose, client, showToast }) {
  const { resendInvite, markLoginDetailsSent, currentUser } = useApp();
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
        onClick={() => markLoginDetailsSent(client.id)}
        className="w-full mt-3 bg-black text-white text-sm font-bold py-3 rounded-xl flex items-center justify-center gap-2"
      >
        <Mail size={15} /> EMAIL THESE DETAILS
      </a>
      <button
        onClick={() => {
          const activateUrl = `${window.location.origin}/activate`;
          navigator.clipboard?.writeText(`App: ${activateUrl}\nEmail: ${client.username}\nCode: ${code}`);
          markLoginDetailsSent(client.id);
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

// "Sent" only means the coach used the Email/Copy action in Send Login
// Details at least once — there's no real delivery confirmation, so it's
// a proxy, but it's still the difference between "haven't touched this
// yet" and "already gave them their login."
export function clientStatusPill(c) {
  if (c.status === "active") return { tone: "outline", label: "Active" };
  if (c.loginSent) return { tone: "default", label: "Sent" };
  return { tone: "muted", label: "Not sent yet" };
}

function PhaseCell({ phase, needsNewPhase }) {
  if (!phase) return <span className="text-white text-sm">No phase scheduled</span>;
  const today = localDateKey();
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
      <p className="text-white text-sm font-medium truncate">{phase.name}</p>
      <p className="text-white text-xs mt-0.5">
        {phase.endDate ? `Ends ${new Date(phase.endDate).toLocaleDateString()}` : "No end date"}
      </p>
      {pct !== null && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="w-28">
            <ProgressBar value={pct} max={100} height={5} color={MEASURE_BLUE} trackClassName="bg-white/10" />
          </div>
          <span className="text-white text-[11px] font-semibold tabular-nums shrink-0">{pct}%</span>
        </div>
      )}
      {needsNewPhase && (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-md mt-1.5"
          style={{ backgroundColor: "rgba(239,68,68,0.12)", color: OVER_RED }}
        >
          <AlertTriangle size={10} /> Needs new phase
        </span>
      )}
    </div>
  );
}

function NextPhaseCell({ phase }) {
  if (!phase) return <span className="text-white text-sm">—</span>;
  return (
    <div className="min-w-[115px]">
      <p className="text-white text-sm font-medium truncate">{phase.name}</p>
      <p className="text-white text-xs mt-0.5">Starts {new Date(phase.startDate).toLocaleDateString()}</p>
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
function EngagementBadges({ awaitingReply, pendingCheckins, onOpenMessages, onOpenCheckins }) {
  if (!awaitingReply && !pendingCheckins) return <span className="text-white text-xs">—</span>;
  return (
    <div className="flex items-center gap-1.5">
      {awaitingReply && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenMessages?.();
          }}
          className="flex items-center gap-1 text-[11px] font-bold px-1.5 py-1 rounded-md transition-colors hover:brightness-125"
          style={{ backgroundColor: "rgba(47,143,255,0.14)", color: MEASURE_BLUE }}
        >
          <MessageCircle size={11} /> 1
        </button>
      )}
      {pendingCheckins > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenCheckins?.();
          }}
          className="flex items-center gap-1 text-[11px] font-bold px-1.5 py-1 rounded-md transition-colors hover:brightness-125"
          style={{ backgroundColor: "rgba(47,143,255,0.14)", color: MEASURE_BLUE }}
        >
          <NotebookPen size={11} /> {pendingCheckins}
        </button>
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
      <div className="flex items-stretch rounded-lg overflow-hidden border" style={{ borderColor: CLIENT_DARK_BORDER }}>
        <button
          onClick={onOpen}
          className="text-white text-xs font-semibold px-3.5 py-2 transition-colors hover:bg-white/[0.12]"
          style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
        >
          OPEN
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-white px-2 border-l transition-colors hover:bg-white/[0.12]"
          style={{ backgroundColor: "rgba(255,255,255,0.06)", borderColor: CLIENT_DARK_BORDER }}
        >
          <ChevronDown size={13} />
        </button>
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1 z-20 border rounded-xl shadow-lg overflow-hidden w-48"
            style={{ backgroundColor: CLIENT_DARK_SURFACE_2, borderColor: CLIENT_DARK_BORDER }}
          >
            {onTogglePause && (
              <button
                onClick={() => {
                  setOpen(false);
                  onTogglePause();
                }}
                className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium hover:bg-red-500/10 transition-colors"
                style={{ color: OVER_RED }}
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
              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium hover:bg-red-500/10 transition-colors"
              style={{ color: OVER_RED }}
            >
              <Trash2 size={13} /> Remove client
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function CoachClients({ showToast, search, setSearch, openClientId, onOpenClientHandled }) {
  const navigate = useNavigate();
  const { db, removeClient, startViewAsClient, setClientAccessPaused, usersReady: dbReady } = useApp();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  // Which tab (and whether to jump straight into the messages thread)
  // to open the client on — set when a specific engagement badge was
  // clicked (e.g. the unread-message pill) rather than the row itself,
  // so that jumps straight to what needs attention instead of Summary.
  const [openAction, setOpenAction] = useState(null); // { tab, messages } | null

  function openClient(id, action = null) {
    setSelectedId(id);
    setOpenAction(action);
  }

  // A caller outside this tab (e.g. "Review Client" on an APEX Insight in
  // Coach Overview) asked to jump straight into one specific client rather
  // than landing on the roster list — open it the same way a row click
  // would, then tell the parent it's been handled so this doesn't re-fire.
  useEffect(() => {
    if (!openClientId) return;
    openClient(openClientId);
    onOpenClientHandled?.();
  }, [openClientId]);
  const [checkedIds, setCheckedIds] = useState(() => new Set());
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Single-row "Remove client" (the desktop table's ... dropdown) used to
  // call removeClient the instant it was tapped — no confirmation at all,
  // unlike the bulk-select path below. One stray tap on that menu item
  // permanently deleted a client's whole account, history and messages
  // with zero chance to back out. Now it opens this same kind of
  // are-you-sure sheet first, just like bulk remove already does.
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  // Pausing cuts the client off from the app immediately. It used to fire
  // the instant the lock icon was tapped — same "one stray tap" problem
  // "Remove client" had, except this button sits right next to the equally
  // common "View as Client" icon in the mobile card row, so a mis-tap is a
  // real risk. Un-pausing (restoring access) stays instant since it only
  // ever helps a client, never hurts one.
  const [confirmPauseId, setConfirmPauseId] = useState(null);
  const [confirmPauseText, setConfirmPauseText] = useState("");
  // Extra friction on top of the sheet itself: typing the exact name (like
  // GitHub's "type the repo name to confirm") means even opening this sheet
  // and tapping through it fast can't delete anyone by accident — the
  // button stays disabled until the name matches.
  const [confirmRemoveText, setConfirmRemoveText] = useState("");
  const q = (search || "").toLowerCase();
  const clients = db.users.filter((u) => u.role === "client" && (u.name || "").toLowerCase().includes(q));
  const today = localDateKey();

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
    // Cleared the moment the coach actually opens this client's thread
    // (see ThreadMessages' mark-as-seen effect in CoachMessages.jsx), not
    // just once they send a reply — opening it to read it is enough to
    // stop flagging it as needing attention.
    const awaitingReply = !!(lastMsg && lastMsg.from === "client" && lastMsg.date > (c.coachMessagesSeenAt || 0));
    const pendingCheckins = ((db.formResponses || {})[c.id] || []).filter((r) => r.read === false).length;
    const needsNewPhase = needsNewPhaseSoon(currentPhase, nextPhase, today);
    return { currentPhase, nextPhase, awaitingReply, pendingCheckins, needsNewPhase };
  }

  return (
    <DarkPage>
      {checkedIds.size > 0 ? (
        <div
          className="flex items-center justify-between gap-3 mb-4 rounded-xl px-4 py-3 border"
          style={{ backgroundColor: CLIENT_DARK_SURFACE_2, borderColor: CLIENT_DARK_BORDER }}
        >
          <div className="flex items-center gap-3">
            <button onClick={() => setCheckedIds(new Set())} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 text-white">
              <X size={14} />
            </button>
            <p className="text-sm font-semibold text-white">{checkedIds.size} selected</p>
          </div>
          <button
            onClick={() => setConfirmRemove(true)}
            className="flex items-center gap-1.5 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition-colors hover:brightness-110"
            style={{ backgroundColor: OVER_RED }}
          >
            <Trash2 size={13} /> REMOVE
          </button>
        </div>
      ) : (
        <DarkPageHeader
          title="Clients"
          subtitle={`${clients.length} total · access every client's full profile`}
          right={
            <button
              onClick={() => setAddOpen(true)}
              aria-label="Add client"
              className="flex items-center gap-2 bg-white text-black text-sm font-bold px-4 py-2.5 rounded-xl shrink-0 transition-opacity hover:opacity-90"
            >
              <UserPlus size={16} /> <span className="hidden sm:inline">ADD CLIENT</span>
            </button>
          }
        />
      )}

      <div
        className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 mb-4 md:max-w-sm border"
        style={{ backgroundColor: CLIENT_DARK_SURFACE_2, borderColor: CLIENT_DARK_BORDER }}
      >
        <Search size={15} className="text-white" />
        <input
          value={search || ""}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients"
          className="bg-transparent outline-none text-white text-sm flex-1 placeholder:text-white"
        />
      </div>

      {/* desktop table — horizontally scrollable on any viewport narrower than
          its min-width, with momentum scrolling on iOS Safari so a swipe
          actually glides instead of just nudging a pixel at a time */}
      <div
        className="hidden md:block border rounded-2xl overflow-x-auto"
        style={{ WebkitOverflowScrolling: "touch", backgroundColor: CLIENT_DARK_SURFACE, borderColor: CLIENT_DARK_BORDER }}
      >
        <table className="w-full min-w-[1080px] text-left border-collapse">
          <thead>
            <tr className="border-b" style={{ backgroundColor: "rgba(255,255,255,0.03)", borderColor: CLIENT_DARK_BORDER }}>
              <th className="w-10 px-3 py-3" />
              <th className="px-2 py-3 text-white text-[11px] font-semibold tracking-wide">NAME</th>
              <th className="px-3 py-3 text-white text-[11px] font-semibold tracking-wide">MAIN PROGRAM</th>
              <th className="px-3 py-3 text-white text-[11px] font-semibold tracking-wide">CURRENT PHASE</th>
              <th className="px-3 py-3 text-white text-[11px] font-semibold tracking-wide">NEXT PHASE</th>
              <th className="px-3 py-3 text-white text-[11px] font-semibold tracking-wide">ENGAGEMENT</th>
              <th className="px-3 py-3 text-white text-[11px] font-semibold tracking-wide">STATUS</th>
              <th className="px-3 py-3 text-white text-[11px] font-semibold tracking-wide text-right">ACTION</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-white text-sm">
                  {dbReady ? "No clients yet — add your first one to get started." : "Loading your clients…"}
                </td>
              </tr>
            )}
            {clients.map((c) => {
              const { currentPhase, nextPhase, awaitingReply, pendingCheckins, needsNewPhase } = rowData(c);
              return (
                <tr
                  key={c.id}
                  onClick={() => openClient(c.id)}
                  className="border-b last:border-0 hover:bg-white/[0.03] cursor-pointer transition-colors"
                  style={{ borderColor: CLIENT_DARK_BORDER, backgroundColor: checkedIds.has(c.id) ? "rgba(47,143,255,0.08)" : undefined }}
                >
                  <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checkedIds.has(c.id)}
                      onChange={() => toggleChecked(c.id)}
                      className="w-4 h-4 rounded cursor-pointer"
                      style={{ accentColor: MEASURE_BLUE }}
                    />
                  </td>
                  <td className="px-2 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={c.name} url={c.avatarUrl} size={36} dark />
                      <div className="min-w-0">
                        <p className="text-white font-semibold text-sm truncate">{c.name}</p>
                        <p className="text-white text-xs truncate">{c.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    <span className="text-white text-sm">{mainProgramLabel(c)}</span>
                  </td>
                  <td className="px-3 py-3.5">
                    <PhaseCell phase={currentPhase} needsNewPhase={needsNewPhase} />
                  </td>
                  <td className="px-3 py-3.5">
                    <NextPhaseCell phase={nextPhase} />
                  </td>
                  <td className="px-3 py-3.5">
                    <EngagementBadges
                      awaitingReply={awaitingReply}
                      pendingCheckins={pendingCheckins}
                      onOpenMessages={() => openClient(c.id, { messages: true })}
                      onOpenCheckins={() => openClient(c.id, { tab: "checkins" })}
                    />
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <Pill tone={clientStatusPill(c).tone} dark>
                        {clientStatusPill(c).label}
                      </Pill>
                      {c.accessPaused && (
                        <Pill tone="warning" dark>
                          Paused
                        </Pill>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => {
                          startViewAsClient(c.id);
                          navigate("/app");
                        }}
                        title="Browse and act in the app exactly as this client — works even before they've activated"
                        aria-label={`View as ${c.name}`}
                        className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors shrink-0"
                        style={{ backgroundColor: "rgba(47,143,255,0.12)", color: MEASURE_BLUE }}
                      >
                        <Repeat size={14} />
                      </button>
                      <RowActions
                        onOpen={() => openClient(c.id)}
                        onRemove={() => setConfirmRemoveId(c.id)}
                        paused={!!c.accessPaused}
                        onTogglePause={
                          c.status === "active"
                            ? () => (c.accessPaused ? setClientAccessPaused(c.id, false) : setConfirmPauseId(c.id))
                            : undefined
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
          <DarkPanel className="px-5 py-10 text-center text-white text-sm">
            {dbReady ? "No clients yet — add your first one to get started." : "Loading your clients…"}
          </DarkPanel>
        )}
        {clients.map((c) => {
          const { currentPhase, nextPhase, awaitingReply, pendingCheckins, needsNewPhase } = rowData(c);
          return (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => openClient(c.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openClient(c.id)}
              className="w-full text-left border rounded-2xl p-4 active:bg-white/[0.03] transition-colors cursor-pointer"
              style={{ backgroundColor: CLIENT_DARK_SURFACE, borderColor: CLIENT_DARK_BORDER }}
            >
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  checked={checkedIds.has(c.id)}
                  onChange={() => toggleChecked(c.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 rounded cursor-pointer shrink-0"
                  style={{ accentColor: MEASURE_BLUE }}
                />
                <Avatar name={c.name} url={c.avatarUrl} size={42} dark />
                <div className="min-w-0 flex-1">
                  <p className="text-white font-semibold text-sm truncate">{c.name}</p>
                  <p className="text-white text-xs truncate">{mainProgramLabel(c)}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startViewAsClient(c.id);
                    navigate("/app");
                  }}
                  title="Browse and act in the app exactly as this client — works even before they've activated"
                  aria-label={`View as ${c.name}`}
                  className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0"
                  style={{ backgroundColor: "rgba(47,143,255,0.12)", color: MEASURE_BLUE }}
                >
                  <Repeat size={14} />
                </button>
                {c.status === "active" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (c.accessPaused) setClientAccessPaused(c.id, false);
                      else setConfirmPauseId(c.id);
                    }}
                    title={c.accessPaused ? "Resume access" : "Pause access (e.g. insufficient payment)"}
                    aria-label={c.accessPaused ? `Resume access for ${c.name}` : `Pause access for ${c.name}`}
                    className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0"
                    style={
                      c.accessPaused
                        ? { backgroundColor: "rgba(239,68,68,0.12)", color: OVER_RED }
                        : { backgroundColor: "rgba(255,255,255,0.06)", color: "#FFFFFF" }
                    }
                  >
                    {c.accessPaused ? <Unlock size={14} /> : <Lock size={14} />}
                  </button>
                )}
                <Pill tone={clientStatusPill(c).tone} dark>
                  {clientStatusPill(c).label}
                </Pill>
              </div>
              {c.accessPaused && (
                <p className="flex items-center gap-1 text-xs font-medium mb-2.5" style={{ color: OVER_RED }}>
                  <Lock size={11} /> Access paused
                </p>
              )}
              <div className="flex items-center justify-between gap-3">
                <PhaseCell phase={currentPhase} needsNewPhase={needsNewPhase} />
                <EngagementBadges
                  awaitingReply={awaitingReply}
                  pendingCheckins={pendingCheckins}
                  onOpenMessages={() => openClient(c.id, { messages: true })}
                  onOpenCheckins={() => openClient(c.id, { tab: "checkins" })}
                />
              </div>
              {nextPhase && (
                <p className="text-white text-xs mt-2 pt-2 border-t" style={{ borderColor: CLIENT_DARK_BORDER }}>
                  Next: {nextPhase.name} · starts {new Date(nextPhase.startDate).toLocaleDateString()}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <AddClientSheet open={addOpen} onClose={() => setAddOpen(false)} onCreated={(id) => openClient(id)} />
      {selectedId && (
        <CoachClientDetail
          key={`${selectedId}:${openAction?.tab || ""}:${openAction?.messages ? "m" : ""}`}
          clientId={selectedId}
          initialTab={openAction?.tab}
          openMessages={openAction?.messages}
          onClose={() => {
            setSelectedId(null);
            setOpenAction(null);
          }}
          showToast={showToast}
        />
      )}

      <BottomSheet
        open={confirmRemove}
        onClose={() => {
          setConfirmRemove(false);
          setConfirmRemoveText("");
        }}
        title="Remove selected clients?"
      >
        <p className="text-black/50 text-sm mb-4">
          This permanently deletes {checkedIds.size} client{checkedIds.size === 1 ? "" : "s"} and all their workout history,
          messages, and progress data. This can't be undone.
        </p>
        <Field label={`Type REMOVE to confirm`}>
          <TextInput value={confirmRemoveText} onChange={(e) => setConfirmRemoveText(e.target.value)} placeholder="REMOVE" />
        </Field>
        <DangerButton
          className="w-full mt-3 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={confirmRemoveText.trim().toUpperCase() !== "REMOVE"}
          onClick={() => {
            bulkRemove();
            setConfirmRemoveText("");
          }}
        >
          <Trash2 size={14} /> Remove {checkedIds.size} client{checkedIds.size === 1 ? "" : "s"}
        </DangerButton>
      </BottomSheet>

      <BottomSheet
        open={!!confirmRemoveId}
        onClose={() => {
          setConfirmRemoveId(null);
          setConfirmRemoveText("");
        }}
        title="Remove this client?"
      >
        <p className="text-black/50 text-sm mb-4">
          This permanently deletes {db.users.find((u) => u.id === confirmRemoveId)?.name || "this client"} and all their
          workout history, messages, and progress data. This can't be undone.
        </p>
        <Field label={`Type their name (${db.users.find((u) => u.id === confirmRemoveId)?.name || ""}) to confirm`}>
          <TextInput value={confirmRemoveText} onChange={(e) => setConfirmRemoveText(e.target.value)} placeholder="Full name" />
        </Field>
        <DangerButton
          className="w-full mt-3 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={
            confirmRemoveText.trim().toLowerCase() !==
            (db.users.find((u) => u.id === confirmRemoveId)?.name || "").trim().toLowerCase()
          }
          onClick={() => {
            removeClient(confirmRemoveId);
            showToast("Client removed");
            setConfirmRemoveId(null);
            setConfirmRemoveText("");
          }}
        >
          <Trash2 size={14} /> Remove client
        </DangerButton>
      </BottomSheet>

      <BottomSheet
        open={!!confirmPauseId}
        onClose={() => {
          setConfirmPauseId(null);
          setConfirmPauseText("");
        }}
        title="Pause this client's access?"
      >
        <p className="text-black/50 text-sm mb-4">
          {db.users.find((u) => u.id === confirmPauseId)?.name || "This client"} won't be able to open their program,
          nutrition, or progress until you resume access. You can undo this any time.
        </p>
        <Field label={`Type their name (${db.users.find((u) => u.id === confirmPauseId)?.name || ""}) to confirm`}>
          <TextInput value={confirmPauseText} onChange={(e) => setConfirmPauseText(e.target.value)} placeholder="Full name" />
        </Field>
        <DangerButton
          className="w-full mt-3 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={
            confirmPauseText.trim().toLowerCase() !==
            (db.users.find((u) => u.id === confirmPauseId)?.name || "").trim().toLowerCase()
          }
          onClick={() => {
            setClientAccessPaused(confirmPauseId, true);
            showToast("Access paused");
            setConfirmPauseId(null);
            setConfirmPauseText("");
          }}
        >
          <Lock size={14} /> Pause access
        </DangerButton>
      </BottomSheet>
    </DarkPage>
  );
}
