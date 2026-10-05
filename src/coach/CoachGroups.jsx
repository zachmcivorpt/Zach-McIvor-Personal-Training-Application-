import React, { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../lib/AppContext";
import { Avatar, BottomSheet, FullScreenOverlay, Field, TextInput, TextArea, SecondaryButton, DangerButton } from "../components/ui";
import { MEASURE_BLUE, CLIENT_DARK_BORDER, CLIENT_DARK_SURFACE_2 } from "../theme";
import { DarkPage, DarkPanel, DarkPageHeader } from "./darkUI";
import { Users2, Plus, ChevronLeft, MoreVertical, UserPlus, Settings, Send, X, Trash2 } from "lucide-react";

// A group's "members" are just client ids — resolved against the live
// roster everywhere they're shown, so a renamed/removed client is never
// stale inside a group the way a copied name/avatar would be.
function emptyDraft() {
  return { name: "", description: "", memberIds: [] };
}

// Shared client-picker checklist — used both by group creation (picking
// the starting members) and by "+ Add a Member" (picking who to add to an
// existing group), so the two never drift into two different-looking
// pickers for the same action.
function ClientChecklist({ clients, checkedIds, onToggle, emptyText }) {
  if (clients.length === 0) return <p className="text-black/30 text-sm">{emptyText}</p>;
  return (
    <div className="space-y-1.5 max-h-80 overflow-y-auto">
      {clients.map((c) => {
        const checked = checkedIds.includes(c.id);
        return (
          <button
            key={c.id}
            onClick={() => onToggle(c.id)}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-colors ${
              checked ? "bg-blue-50 border-blue-200" : "bg-black/[0.03] border-black/8"
            }`}
          >
            <Avatar name={c.name} url={c.avatarUrl} size={30} />
            <span className="text-black text-sm font-medium flex-1 text-left">{c.name}</span>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${checked ? "bg-blue-500 border-blue-500" : "border-black/20"}`}>
              {checked && <div className="w-2 h-2 rounded-full bg-white" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function GroupEditor({ activeClients, onClose, onSave }) {
  const [draft, setDraft] = useState(emptyDraft);
  const canSave = draft.name.trim().length > 0;

  function toggleMember(clientId) {
    setDraft((d) => ({ ...d, memberIds: d.memberIds.includes(clientId) ? d.memberIds.filter((id) => id !== clientId) : [...d.memberIds, clientId] }));
  }

  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[90] bg-white flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-6 pb-3 sticky top-0 bg-white z-10 border-b border-black/5">
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-black/60 -ml-2">
            <ChevronLeft size={20} />
          </button>
          <span className="text-black font-semibold">New Group</span>
          <button onClick={() => canSave && onSave(draft)} disabled={!canSave} className="text-sm font-bold text-black disabled:text-black/20">
            Save
          </button>
        </div>

        <div className="px-5 py-5 space-y-5 max-w-2xl w-full mx-auto">
          <Field label="GROUP NAME">
            <TextInput value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. Forge Your Path: The Collective" />
          </Field>
          <Field label="DESCRIPTION" hint="Optional — shown at the top of the group">
            <TextArea rows={2} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="What this group is about..." />
          </Field>

          <div>
            <p className="text-black font-semibold text-sm mb-3">Members {draft.memberIds.length > 0 && `(${draft.memberIds.length})`}</p>
            <ClientChecklist clients={activeClients} checkedIds={draft.memberIds} onToggle={toggleMember} emptyText="No active clients yet." />
          </div>
        </div>
      </div>
    </FullScreenOverlay>
  );
}

function AddMemberSheet({ open, group, activeClients, onClose, showToast }) {
  const { updateGroup } = useApp();
  const [picked, setPicked] = useState([]);
  const candidates = activeClients.filter((c) => !(group?.memberIds || []).includes(c.id));

  function toggle(clientId) {
    setPicked((p) => (p.includes(clientId) ? p.filter((id) => id !== clientId) : [...p, clientId]));
  }

  async function addPicked() {
    if (picked.length === 0) return;
    try {
      await updateGroup(group.id, { memberIds: [...(group.memberIds || []), ...picked] });
      showToast(`Added ${picked.length} member${picked.length === 1 ? "" : "s"}`);
      setPicked([]);
      onClose();
    } catch (err) {
      showToast(err.message || "Couldn't add members");
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Add a Member">
      <ClientChecklist clients={candidates} checkedIds={picked} onToggle={toggle} emptyText="Every active client is already in this group." />
      {candidates.length > 0 && (
        <SecondaryButton className="w-full mt-4" disabled={picked.length === 0} onClick={addPicked}>
          Add {picked.length > 0 ? `(${picked.length})` : ""}
        </SecondaryButton>
      )}
    </BottomSheet>
  );
}

function GroupSettingsSheet({ open, group, clientsById, onClose, onDeleted, showToast }) {
  const { updateGroup, deleteGroup } = useApp();
  const [name, setName] = useState(group?.name || "");
  const [description, setDescription] = useState(group?.description || "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const loadedRef = useRef(group?.id);

  // Re-seed the draft if a different group's settings are opened without
  // this sheet having fully unmounted in between.
  if (group && loadedRef.current !== group.id) {
    loadedRef.current = group.id;
    setName(group.name || "");
    setDescription(group.description || "");
  }

  if (!group) return null;
  const members = (group.memberIds || []).map((id) => clientsById[id]).filter(Boolean);

  async function save() {
    setSaving(true);
    try {
      await updateGroup(group.id, { name: name.trim(), description: description.trim() });
      showToast("Group updated");
      onClose();
    } catch (err) {
      showToast(err.message || "Couldn't save that group");
    } finally {
      setSaving(false);
    }
  }

  function removeMember(clientId) {
    updateGroup(group.id, { memberIds: group.memberIds.filter((id) => id !== clientId) }).catch((err) => showToast(err.message || "Couldn't remove that member"));
  }

  async function confirmAndDelete() {
    try {
      await deleteGroup(group.id);
      showToast("Group deleted");
      onDeleted();
    } catch (err) {
      showToast(err.message || "Couldn't delete that group");
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Group Settings">
      <div className="space-y-4">
        <Field label="GROUP NAME">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" />
        </Field>
        <Field label="DESCRIPTION">
          <TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this group is about..." />
        </Field>
        <SecondaryButton className="w-full" disabled={!name.trim() || saving} onClick={save}>
          {saving ? "Saving..." : "Save changes"}
        </SecondaryButton>

        <div className="pt-2">
          <p className="text-black font-semibold text-sm mb-2">Members ({members.length})</p>
          {members.length === 0 ? (
            <p className="text-black/30 text-sm">No members yet.</p>
          ) : (
            <div className="space-y-1.5">
              {members.map((c) => (
                <div key={c.id} className="flex items-center gap-3 bg-black/[0.03] border border-black/8 rounded-xl px-3.5 py-2.5">
                  <Avatar name={c.name} url={c.avatarUrl} size={28} />
                  <span className="text-black text-sm font-medium flex-1 truncate">{c.name}</span>
                  <button onClick={() => removeMember(c.id)} aria-label={`Remove ${c.name}`} className="text-black/30 hover:text-black/60 shrink-0">
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-black/5">
          {!confirmDelete ? (
            <DangerButton className="w-full" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} /> Delete group
            </DangerButton>
          ) : (
            <div className="flex gap-2">
              <SecondaryButton className="flex-1" onClick={() => setConfirmDelete(false)}>
                Cancel
              </SecondaryButton>
              <DangerButton className="flex-1" onClick={confirmAndDelete}>
                Confirm delete
              </DangerButton>
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

function dateDividerLabel(ts) {
  return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// Bolds "@everyone" and "@FirstName" tokens that actually match the
// current group's roster — a plain "@" in someone's message text (not
// meant as a mention) never gets highlighted, since it's checked against
// real candidates rather than just "starts with @".
function MessageText({ text, mentionCandidates }) {
  const tokens = text.split(/(\s+)/);
  return (
    <p className="whitespace-pre-line">
      {tokens.map((tok, i) => {
        if (!tok.startsWith("@")) return <React.Fragment key={i}>{tok}</React.Fragment>;
        const word = tok.slice(1).replace(/[.,!?;:]+$/, "");
        if (!mentionCandidates.some((c) => c.toLowerCase() === word.toLowerCase())) return <React.Fragment key={i}>{tok}</React.Fragment>;
        return (
          <span key={i} className="font-bold" style={{ color: MEASURE_BLUE }}>
            {tok}
          </span>
        );
      })}
    </p>
  );
}

function GroupDetail({ group, clientsById, activeClients, onClose, showToast }) {
  const { db, sendGroupMessage } = useApp();
  const [input, setInput] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const endRef = useRef(null);
  const messages = db.groupMessages[group.id] || [];
  const members = (group.memberIds || []).map((id) => clientsById[id]).filter(Boolean);
  // "everyone" plus every current member's first name — what MessageText
  // checks a typed "@token" against to decide whether to bold it.
  const mentionCandidates = useMemo(() => ["everyone", ...members.map((m) => (m.name || "").split(" ")[0]).filter(Boolean)], [members]);

  const mentionQuery = (() => {
    const lastToken = input.split(/\s+/).pop() || "";
    if (!lastToken.startsWith("@")) return null;
    return lastToken.slice(1).toLowerCase();
  })();
  const mentionMatches = mentionQuery == null ? [] : mentionCandidates.filter((c) => c.toLowerCase().startsWith(mentionQuery)).slice(0, 5);

  useEffect(() => {
    setTimeout(() => endRef.current?.scrollIntoView({ block: "end" }), 50);
  }, [messages.length]);

  function send() {
    if (!input.trim()) return;
    sendGroupMessage(group.id, input);
    setInput("");
  }

  function pickMention(name) {
    const parts = input.split(/\s+/);
    parts[parts.length - 1] = `@${name}`;
    setInput(parts.join(" ") + " ");
  }

  // Date dividers, same convention as the reference — one pill per
  // calendar day a message landed on, inserted right before that day's
  // first message. Computed once here, not by mutating a variable inside
  // the render loop below, so the list itself stays a pure map.
  const messagesWithDividers = messages.map((m, i) => {
    const dateLabel = dateDividerLabel(m.date);
    const showDivider = i === 0 || dateLabel !== dateDividerLabel(messages[i - 1].date);
    return { msg: m, dateLabel, showDivider };
  });

  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[90] flex flex-col" style={{ backgroundColor: "#0A0A0C" }}>
        <div className="flex items-center gap-3 px-5 pt-6 pb-3 border-b" style={{ borderColor: CLIENT_DARK_BORDER }}>
          <button onClick={onClose} className="w-9 h-9 -ml-2 flex items-center justify-center text-white shrink-0">
            <ChevronLeft size={20} />
          </button>
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(47,143,255,0.15)" }}>
            <Users2 size={16} style={{ color: MEASURE_BLUE }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white font-semibold text-sm truncate">{group.name}</p>
            <p className="text-white text-xs mt-0.5">
              {members.length} member{members.length === 1 ? "" : "s"}
            </p>
          </div>
          <button onClick={() => setMenuOpen(true)} aria-label="Group menu" className="w-9 h-9 flex items-center justify-center text-white shrink-0">
            <MoreVertical size={19} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
          {messages.length === 0 && <p className="text-white text-sm text-center py-10">No messages yet — say hello to the group.</p>}
          {messagesWithDividers.map(({ msg: m, dateLabel, showDivider }) => {
            const author = clientsById[m.fromClientId];
            return (
              <React.Fragment key={m.id}>
                {showDivider && (
                  <div className="flex justify-center my-3">
                    <span className="text-white text-[11px] font-medium px-3 py-1 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
                      {dateLabel}
                    </span>
                  </div>
                )}
                <div className="flex items-start gap-2.5 py-1.5">
                  <Avatar name={m.from === "coach" ? "Coach" : author?.name || "?"} url={author?.avatarUrl} size={32} dark />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-white text-xs font-semibold truncate">{m.from === "coach" ? "You" : author?.name || "Removed member"}</span>
                      <span className="text-white text-[10px] shrink-0">{new Date(m.date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                    </div>
                    <div className="mt-1 rounded-2xl px-3.5 py-2.5 text-sm text-white inline-block max-w-full" style={{ backgroundColor: CLIENT_DARK_SURFACE_2 }}>
                      <MessageText text={m.text} mentionCandidates={mentionCandidates} />
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          <div ref={endRef} />
        </div>

        <div className="relative px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t" style={{ borderColor: CLIENT_DARK_BORDER }}>
          {mentionMatches.length > 0 && (
            <div className="absolute left-5 right-5 bottom-full mb-2 rounded-xl overflow-hidden border" style={{ backgroundColor: CLIENT_DARK_SURFACE_2, borderColor: CLIENT_DARK_BORDER }}>
              {mentionMatches.map((name) => (
                <button key={name} onClick={() => pickMention(name)} className="w-full text-left px-3.5 py-2 text-sm text-white hover:bg-white/8">
                  @{name}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Message the group..."
              className="flex-1 min-w-0 bg-white/8 rounded-full px-4 py-3 text-sm text-white outline-none placeholder:text-white"
            />
            <button onClick={send} disabled={!input.trim()} className="w-11 h-11 rounded-full bg-white flex items-center justify-center shrink-0 disabled:opacity-40">
              <Send size={16} className="text-black" />
            </button>
          </div>
        </div>

        <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={group.name}>
          <div className="space-y-1">
            <button
              onClick={() => {
                setMenuOpen(false);
                setAddMemberOpen(true);
              }}
              className="w-full flex items-center gap-3 px-1 py-3 text-left border-b border-black/5"
            >
              <UserPlus size={17} className="text-black/60" />
              <span className="text-black text-sm font-medium">Add a Member</span>
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                setSettingsOpen(true);
              }}
              className="w-full flex items-center gap-3 px-1 py-3 text-left"
            >
              <Settings size={17} className="text-black/60" />
              <span className="text-black text-sm font-medium">Group Settings</span>
            </button>
          </div>
        </BottomSheet>

        <AddMemberSheet open={addMemberOpen} group={group} activeClients={activeClients} onClose={() => setAddMemberOpen(false)} showToast={showToast} />
        <GroupSettingsSheet
          open={settingsOpen}
          group={group}
          clientsById={clientsById}
          onClose={() => setSettingsOpen(false)}
          onDeleted={() => {
            setSettingsOpen(false);
            onClose();
          }}
          showToast={showToast}
        />
      </div>
    </FullScreenOverlay>
  );
}

function GroupCard({ group, clientsById, onOpen }) {
  const members = (group.memberIds || []).map((id) => clientsById[id]).filter(Boolean);
  const ringStyle = { "--tw-ring-color": "#141414" };

  return (
    <DarkPanel chamfer className="active:scale-[0.98] transition-transform">
      <button onClick={onOpen} className="relative w-full text-left cursor-pointer hover:bg-white/[0.03] transition-colors">
        <div className="relative p-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border" style={{ backgroundColor: "rgba(47,143,255,0.12)", borderColor: "rgba(47,143,255,0.25)" }}>
            <Users2 size={17} style={{ color: MEASURE_BLUE }} />
          </div>
          <p className="text-white font-bold mt-2.5 truncate">{group.name}</p>
          <p className="text-white text-xs mt-0.5 truncate">{group.description || `${members.length} member${members.length === 1 ? "" : "s"}`}</p>

          <div className="flex items-center justify-between mt-3.5 pt-3 border-t" style={{ borderColor: CLIENT_DARK_BORDER }}>
            {members.length > 0 ? (
              <div className="flex items-center -space-x-2">
                {members.slice(0, 4).map((m) => (
                  <div key={m.id} className="ring-2 rounded-full" style={ringStyle}>
                    <Avatar name={m.name} url={m.avatarUrl} size={26} dark />
                  </div>
                ))}
                {members.length > 4 && (
                  <div className="w-[26px] h-[26px] rounded-full ring-2 flex items-center justify-center text-white text-[10px] font-semibold" style={{ backgroundColor: "rgba(255,255,255,0.08)", ...ringStyle }}>
                    +{members.length - 4}
                  </div>
                )}
              </div>
            ) : (
              <span className="flex items-center gap-1 text-white text-xs">
                <Users2 size={12} /> No members yet
              </span>
            )}
            <span className="text-white text-xs">{members.length} member{members.length === 1 ? "" : "s"}</span>
          </div>
        </div>
      </button>
    </DarkPanel>
  );
}

export default function CoachGroups({ showToast }) {
  const { db, createGroup } = useApp();
  const [creating, setCreating] = useState(false);
  const [openGroupId, setOpenGroupId] = useState(null);
  const groups = db.groups || [];
  const activeClients = db.users.filter((u) => u.role === "client" && u.status === "active");
  const clientsById = Object.fromEntries(db.users.map((u) => [u.id, u]));
  const openGroup = groups.find((g) => g.id === openGroupId) || null;

  async function handleCreate(draft) {
    try {
      await createGroup(draft);
      showToast("Group created");
      setCreating(false);
    } catch (err) {
      showToast(err.message || "Couldn't create that group");
    }
  }

  return (
    <DarkPage>
      <DarkPageHeader
        title="Groups"
        subtitle="Group chats for clients training toward the same thing."
        right={
          <button
            onClick={() => setCreating(true)}
            aria-label="New group"
            className="flex items-center gap-2 bg-white text-black text-sm font-bold px-4 py-2.5 rounded-xl shrink-0 transition-opacity hover:opacity-90"
          >
            <Plus size={16} /> <span className="hidden sm:inline">NEW GROUP</span>
          </button>
        }
      />

      {groups.length === 0 ? (
        <div className="border border-dashed rounded-2xl py-14 text-center" style={{ borderColor: "rgba(255,255,255,0.14)" }}>
          <Users2 size={22} className="text-white mx-auto mb-3" />
          <p className="text-white text-sm font-medium">No groups yet</p>
          <p className="text-white text-xs mt-1">Create one to start a group chat with your clients.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} clientsById={clientsById} onOpen={() => setOpenGroupId(g.id)} />
          ))}
        </div>
      )}

      {creating && <GroupEditor activeClients={activeClients} onClose={() => setCreating(false)} onSave={handleCreate} />}
      {openGroup && (
        <GroupDetail group={openGroup} clientsById={clientsById} activeClients={activeClients} onClose={() => setOpenGroupId(null)} showToast={showToast} />
      )}
    </DarkPage>
  );
}
