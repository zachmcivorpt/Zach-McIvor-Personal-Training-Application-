import React, { useEffect, useState } from "react";
import { useApp } from "../lib/AppContext";
import { Card, Pill, Field, TextInput, TextArea, Select, SecondaryButton, DangerButton, FullScreenOverlay, Avatar, BottomSheet } from "../components/ui";
import { CHALLENGE_METRICS, computeLeaderboard, challengeStatus } from "../lib/challengeMetrics";
import { Trophy, Plus, ChevronLeft, Trash2, Users } from "lucide-react";

function emptyDraft() {
  const today = new Date().toISOString().slice(0, 10);
  const inFourWeeks = new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10);
  return { name: "", description: "", type: "leaderboard", metric: "workouts", startDate: today, endDate: inFourWeeks, goalValue: 10, participantIds: [] };
}

function ChallengeEditor({ challenge, activeClients, onClose, onSave, onDelete }) {
  const isNew = !challenge;
  const [draft, setDraft] = useState(() => (challenge ? { ...challenge } : emptyDraft()));
  const [confirmDelete, setConfirmDelete] = useState(false);

  function toggleParticipant(clientId) {
    setDraft((d) => ({
      ...d,
      participantIds: d.participantIds.includes(clientId) ? d.participantIds.filter((id) => id !== clientId) : [...d.participantIds, clientId],
    }));
  }

  const canSave = draft.name.trim().length > 0 && draft.startDate && draft.endDate && draft.endDate >= draft.startDate;

  return (
    <FullScreenOverlay>
      <div className="fixed inset-0 z-[90] bg-white flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-6 pb-3 sticky top-0 bg-white z-10 border-b border-black/5">
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-black/60 -ml-2">
            <ChevronLeft size={20} />
          </button>
          <span className="text-black font-semibold">{isNew ? "New Challenge" : "Edit Challenge"}</span>
          <button onClick={() => canSave && onSave(draft)} disabled={!canSave} className="text-sm font-bold text-black disabled:text-black/20">
            Save
          </button>
        </div>

        <div className="px-5 py-5 space-y-5 max-w-2xl w-full mx-auto">
          <Field label="CHALLENGE NAME">
            <TextInput value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. October Consistency Challenge" />
          </Field>
          <Field label="DESCRIPTION" hint="Shown to participants">
            <TextArea rows={2} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="What this challenge is about..." />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="START DATE">
              <TextInput type="date" value={draft.startDate} onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))} />
            </Field>
            <Field label="END DATE">
              <TextInput type="date" value={draft.endDate} onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))} />
            </Field>
          </div>

          <Field label="WINS BY" hint="How the leaderboard ranks participants">
            <Select value={draft.metric} onChange={(e) => setDraft((d) => ({ ...d, metric: e.target.value }))}>
              {CHALLENGE_METRICS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <p className="text-black font-semibold text-sm mb-3">
              Participants {draft.participantIds.length > 0 && `(${draft.participantIds.length})`}
            </p>
            {activeClients.length === 0 ? (
              <p className="text-black/30 text-sm">No active clients yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {activeClients.map((c) => {
                  const checked = draft.participantIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleParticipant(c.id)}
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
            )}
          </div>

          {!isNew && (
            <div className="pt-4 border-t border-black/5">
              {!confirmDelete ? (
                <DangerButton className="w-full" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={14} /> Delete challenge
                </DangerButton>
              ) : (
                <div className="flex gap-2">
                  <SecondaryButton className="flex-1" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </SecondaryButton>
                  <DangerButton className="flex-1" onClick={() => onDelete(draft.id)}>
                    Confirm delete
                  </DangerButton>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </FullScreenOverlay>
  );
}

function LeaderboardSheet({ challenge, clientsById, onClose }) {
  const { db, updateChallenge } = useApp();
  const rows = challenge ? computeLeaderboard(challenge, db) : [];

  // Clients can't read each other's raw workout/weigh-in data (privacy
  // rules), so they can't compute a live leaderboard themselves — publish
  // a name+rank snapshot onto the challenge doc (which participants ARE
  // allowed to read) whenever the coach opens it here, so the client app
  // can show "you're #2 of 5" without exposing anyone's underlying data.
  useEffect(() => {
    if (!challenge) return;
    const snapshot = rows.map((r) => ({ clientId: r.clientId, name: clientsById[r.clientId]?.name || "Client", value: r.value, rank: r.rank }));
    updateChallenge(challenge.id, { leaderboardSnapshot: snapshot, leaderboardUpdatedAt: Date.now() }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge?.id]);

  if (!challenge) return null;
  const metric = CHALLENGE_METRICS.find((m) => m.id === challenge.metric);

  return (
    <BottomSheet open={!!challenge} onClose={onClose} title={challenge.name}>
      <p className="text-black/40 text-xs mb-4">{metric?.label}</p>
      {rows.length === 0 ? (
        <p className="text-black/30 text-sm text-center py-6">No participants yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const client = clientsById[r.clientId];
            return (
              <div key={r.clientId} className="flex items-center gap-3 bg-black/[0.03] border border-black/8 rounded-xl px-3.5 py-3">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${r.rank <= 3 ? "bg-blue-500 text-white" : "bg-black/8 text-black/50"}`}>
                  {r.rank}
                </span>
                <Avatar name={client?.name || "?"} url={client?.avatarUrl} size={30} />
                <span className="text-black text-sm font-medium flex-1 truncate">{client?.name || "Removed client"}</span>
                <span className="text-black font-bold text-sm">
                  {r.value}
                  {metric?.unit ? ` ${metric.unit}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}

export default function CoachChallenges({ showToast }) {
  const { db, createChallenge, updateChallenge, deleteChallenge } = useApp();
  const [editing, setEditing] = useState(null); // { isNew: true } | challenge | null
  const [viewing, setViewing] = useState(null); // challenge being viewed in the leaderboard sheet
  const challenges = db.challenges || [];
  const activeClients = db.users.filter((u) => u.role === "client" && u.status === "active");
  const clientsById = Object.fromEntries(db.users.map((u) => [u.id, u]));
  const todayKey = new Date().toISOString().slice(0, 10);

  async function handleSave(draft) {
    try {
      if (draft.id && challenges.some((c) => c.id === draft.id)) {
        await updateChallenge(draft.id, draft);
        showToast("Challenge updated");
      } else {
        await createChallenge(draft);
        showToast("Challenge created");
      }
      setEditing(null);
    } catch (err) {
      showToast(err.message || "Couldn't save that challenge");
    }
  }

  function handleDelete(id) {
    deleteChallenge(id);
    showToast("Challenge deleted");
    setEditing(null);
  }

  const STATUS_TONE = { active: "solid", upcoming: "outline", ended: "muted" };
  const STATUS_LABEL = { active: "Active", upcoming: "Upcoming", ended: "Ended" };

  return (
    <div className="max-w-6xl mx-auto px-4 pb-8 md:px-8">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-black/40 text-sm">{challenges.length} total · leaderboards computed from real workout, weigh-in and check-in data</p>
        <button
          onClick={() => setEditing({ isNew: true })}
          aria-label="New challenge"
          className="flex items-center gap-2 bg-black text-white text-sm font-bold px-4 py-2.5 rounded-xl shrink-0"
        >
          <Plus size={16} /> <span className="hidden sm:inline">NEW CHALLENGE</span>
        </button>
      </div>

      {challenges.length === 0 ? (
        <Card>
          <p className="text-black/40 text-sm text-center py-6">No challenges yet — create one to get clients competing.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {challenges.map((c) => {
            const status = challengeStatus(c, todayKey);
            const metric = CHALLENGE_METRICS.find((m) => m.id === c.metric);
            return (
              <Card key={c.id} onClick={() => setViewing(c)}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                    <Trophy size={16} className="text-blue-500" />
                  </div>
                  <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>
                </div>
                <p className="text-black font-semibold mt-2 truncate">{c.name}</p>
                <p className="text-black/40 text-xs mt-0.5">{metric?.label}</p>
                <div className="flex items-center gap-1 text-black/35 text-xs mt-2">
                  <Users size={12} /> {(c.participantIds || []).length} participant{(c.participantIds || []).length === 1 ? "" : "s"}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(c);
                  }}
                  className="text-blue-600 hover:text-blue-700 text-xs font-semibold mt-2.5"
                >
                  Edit
                </button>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <ChallengeEditor
          challenge={editing.isNew ? null : editing}
          activeClients={activeClients}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
      <LeaderboardSheet challenge={viewing} clientsById={clientsById} onClose={() => setViewing(null)} />
    </div>
  );
}
