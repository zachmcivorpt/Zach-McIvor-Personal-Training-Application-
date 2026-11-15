import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Plus, Users } from "lucide-react";
import { BottomSheet } from "../components/ui";
import { MEASURE_BLUE } from "../theme";
import { SoloButton, SoloTextButton, SOLO_TYPE } from "./SoloUI";
import SoloGlassBox from "./SoloGlassBox";
import { soloClearSheetGlass, CLEAR_SHEET_BACKDROP } from "./SoloThemeContext";
import { MAX_PARTNERS, PENDING_PARTNER_CODE_KEY, inviteLink, normalisePartnerCode, teamWeekView } from "./partners";
import { ensurePartnerCode, joinPartner, endPartnership, usePartners } from "./partnerStore";
import { sessionDayLabel } from "./soloCalendar";

// Team week (#234): train with up to 4 friends. Each week both of you hit
// your own sessions, the streak grows; when one trains, the other is told
// (functions/soloPartners.js). Partners see only training days and session
// names, never weights, body stats or photos.
export default function SoloTeamWeek({ profile, todayKey, dark, t }) {
  const uid = profile?.id;
  const { pairs, ready, activity } = usePartners(uid);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [openPair, setOpenPair] = useState(null);
  const [notice, setNotice] = useState("");

  // Opened from a friend's invite link (/solo/join/CODE): join once they're in.
  const joiningRef = useRef(false);
  useEffect(() => {
    if (!ready || !uid || joiningRef.current) return;
    let code = "";
    try {
      code = localStorage.getItem(PENDING_PARTNER_CODE_KEY) || "";
    } catch {
      return;
    }
    if (!code) return;
    joiningRef.current = true;
    joinPartner(profile, code, { pairs })
      .then((r) => setNotice(`You're training with ${r.firstName || "your friend"}. Team week starts now.`))
      .catch((err) => setNotice(err.message))
      .finally(() => {
        try {
          localStorage.removeItem(PENDING_PARTNER_CODE_KEY);
        } catch {
          /* private mode */
        }
      });
  }, [ready, uid, profile, pairs]);

  const rows = useMemo(
    () =>
      pairs.map((pair) => {
        const partnerUid = pair.members.find((m) => m !== uid);
        const theirs = activity[partnerUid];
        return {
          pair,
          partnerUid,
          name: theirs?.firstName || "Your partner",
          lastSession: theirs?.lastSession || null,
          ...teamWeekView({ mine: activity[uid], theirs, todayKey, pairedAt: pair.createdAt }),
        };
      }),
    [pairs, activity, uid, todayKey]
  );

  if (!uid || !ready) return null;

  return (
    <section className="mt-6">
      <p className="text-[11px] font-bold tracking-wide uppercase mb-2" style={{ color: t.textFaint }}>
        Team week
      </p>
      {notice && (
        <p className="text-[12px] mb-2" style={{ color: t.textMuted }} role="status">
          {notice}
        </p>
      )}
      {rows.length === 0 ? (
        <button type="button" onClick={() => setInviteOpen(true)} className="w-full flex items-center gap-3 py-3.5 border-y text-left" style={{ borderColor: t.panelBorder }}>
          <Users size={18} strokeWidth={1.75} color={MEASURE_BLUE} className="shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-semibold">Train with a friend</span>
            <span className="block text-[11px] mt-0.5" style={{ color: t.textMuted }}>
              Both hit your sessions, keep the streak alive.
            </span>
          </span>
          <span className="text-[12px] font-bold uppercase shrink-0" style={{ color: MEASURE_BLUE }}>
            Invite
          </span>
        </button>
      ) : (
        <SoloGlassBox t={t} className="rounded-2xl">
          {rows.map((r, i) => (
            <button
              key={r.pair.id}
              type="button"
              onClick={() => setOpenPair(r)}
              className="w-full flex items-center gap-4 px-4 py-3.5 text-left"
              style={i > 0 ? { borderTop: `1px solid ${t.panelBorder}` } : undefined}
            >
              <span className="w-12 shrink-0 text-center">
                <span className={`block ${SOLO_TYPE.figure}`} style={r.streak > 0 ? { color: MEASURE_BLUE } : undefined}>
                  {r.streak}
                </span>
                <span className="block text-[9px] font-bold uppercase tracking-[0.12em] mt-1" style={{ color: t.textFaint }}>
                  {r.streak === 1 ? "Week" : "Weeks"}
                </span>
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold truncate">You + {r.name}</span>
                <span className="flex items-center gap-3 mt-1.5">
                  <Progress label="You" week={r.me} t={t} />
                  <Progress label={r.name} week={r.them} t={t} />
                </span>
                <span className="block text-[11px] mt-1.5" style={{ color: r.metThisWeek ? MEASURE_BLUE : t.textMuted }}>
                  {statusLine(r)}
                </span>
              </span>
              <ChevronRight size={16} color={t.textFaint} className="shrink-0" />
            </button>
          ))}
          {rows.length < MAX_PARTNERS && (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="w-full flex items-center gap-2 px-4 py-3 text-left text-[12px] font-bold uppercase"
              style={{ borderTop: `1px solid ${t.panelBorder}`, color: MEASURE_BLUE }}
            >
              <Plus size={14} /> Add a partner
            </button>
          )}
        </SoloGlassBox>
      )}

      <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} profile={profile} pairs={pairs} onJoined={(msg) => setNotice(msg)} dark={dark} t={t} />
      <PartnerSheet row={openPair} onClose={() => setOpenPair(null)} todayKey={todayKey} dark={dark} t={t} />
    </section>
  );
}

function statusLine(r) {
  if (r.metThisWeek) return r.streak > 1 ? `Team week done · ${r.streak} in a row` : "Team week done";
  const left = Math.max(0, r.me.target - r.me.done) + Math.max(0, r.them.target - r.them.done);
  return `${left} session${left === 1 ? "" : "s"} to go between you`;
}

// "You ●●○" — one dot per session aimed for this week.
function Progress({ label, week, t }) {
  const dots = Math.min(7, week.target);
  return (
    <span className="flex items-center gap-1.5 min-w-0" aria-label={`${label}: ${week.done} of ${week.target} this week`}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] truncate max-w-[72px]" style={{ color: t.textMuted }}>
        {label}
      </span>
      <span className="flex gap-[3px]" aria-hidden="true">
        {Array.from({ length: dots }, (_, i) => (
          <span
            key={i}
            className="w-[7px] h-[7px] rounded-full"
            style={i < week.done ? { backgroundColor: MEASURE_BLUE } : { border: `1px solid ${t.textFaint}` }}
          />
        ))}
      </span>
    </span>
  );
}

function InviteSheet({ open, onClose, profile, pairs, onJoined, dark, t }) {
  const [code, setCode] = useState(profile?.partnerCode || "");
  const [codeError, setCodeError] = useState("");
  const [shareNote, setShareNote] = useState("");
  const [typed, setTyped] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShareNote("");
    setJoinError("");
    setTyped("");
    if (code) return;
    ensurePartnerCode(profile)
      .then(setCode)
      .catch(() => setCodeError("Couldn't make your invite — check your connection."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function share() {
    if (!code) return;
    const link = inviteLink(code);
    const text = `Train with me on APEX. We both hit our sessions each week and keep the streak going. Join with code ${code}: ${link}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Train with me on APEX", text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setShareNote("Invite copied — paste it to a friend.");
    } catch (err) {
      if (err?.name !== "AbortError") setShareNote(`Send them your code: ${code}`);
    }
  }

  async function join() {
    const c = normalisePartnerCode(typed);
    if (!c) {
      setJoinError("Enter the 6-letter code from your friend's invite.");
      return;
    }
    setJoining(true);
    setJoinError("");
    try {
      const r = await joinPartner(profile, c, { pairs });
      onJoined(r.already ? `You're already training with ${r.firstName || "them"}.` : `You're training with ${r.firstName || "your friend"}. Team week starts now.`);
      onClose();
    } catch (err) {
      setJoinError(err.message);
    } finally {
      setJoining(false);
    }
  }

  const full = pairs.length >= MAX_PARTNERS;
  return (
    <BottomSheet open={open} onClose={onClose} title="Train with a friend" dark={dark} surface={soloClearSheetGlass(dark)} backdropClassName={CLEAR_SHEET_BACKDROP}>
      <div style={{ color: t.text }}>
        <ul className={`${SOLO_TYPE.body} space-y-2`} style={{ color: t.textMuted }}>
          <li>Each week you both hit your own sessions, your Team week streak grows.</li>
          <li>When one of you trains, the other gets a nudge.</li>
          <li>They only see the days you trained and the session name — never your weights, body stats or photos.</li>
        </ul>
        {full ? (
          <p className={`${SOLO_TYPE.body} mt-6`} style={{ color: t.textMuted }}>
            You're training with {MAX_PARTNERS} partners — the most at once.
          </p>
        ) : (
          <>
            <p className={`${SOLO_TYPE.eyebrow} mt-6`} style={{ color: t.textMuted }}>
              Your code
            </p>
            <p className={`${SOLO_TYPE.figure} tracking-[0.18em] mt-2`} data-testid="partner-code">
              {code || "–"}
            </p>
            {codeError && <p className="text-xs text-red-500 mt-2">{codeError}</p>}
            <SoloButton t={t} className="mt-5" onClick={share} disabled={!code}>
              Share invite
            </SoloButton>
            {shareNote && (
              <p className="text-[12px] mt-2 text-center" style={{ color: t.textMuted }}>
                {shareNote}
              </p>
            )}
          </>
        )}
        <div className="mt-6 pt-5 border-t" style={{ borderColor: t.panelBorder }}>
          <label htmlFor="solo-partner-code" className={`block ${SOLO_TYPE.eyebrow} mb-2`} style={{ color: t.textMuted }}>
            Got a friend's code?
          </label>
          <div className="flex gap-2">
            <input
              id="solo-partner-code"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="ABC234"
              autoCapitalize="characters"
              autoComplete="off"
              className="flex-1 min-w-0 rounded-xl px-3.5 py-2.5 text-[13px] uppercase tracking-[0.12em]"
              style={{ backgroundColor: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text }}
            />
            <button
              type="button"
              onClick={join}
              disabled={joining || !typed.trim() || full}
              className="px-4 rounded-xl text-[12px] font-bold uppercase disabled:opacity-30"
              style={{ backgroundColor: t.text, color: t.bg }}
            >
              {joining ? "Joining…" : "Join"}
            </button>
          </div>
          {joinError && <p className="text-xs text-red-500 mt-2">{joinError}</p>}
        </div>
      </div>
    </BottomSheet>
  );
}

function PartnerSheet({ row, onClose, todayKey, dark, t }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setConfirming(false);
    setError("");
  }, [row?.pair?.id]);

  async function end() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    try {
      await endPartnership(row.pair.id);
      onClose();
    } catch {
      setError("Couldn't end it — check your connection and try again.");
    }
  }

  const last = row?.lastSession;
  return (
    <BottomSheet open={!!row} onClose={onClose} title={row ? `You + ${row.name}` : ""} dark={dark} surface={soloClearSheetGlass(dark)} backdropClassName={CLEAR_SHEET_BACKDROP}>
      {row && (
        <div style={{ color: t.text }}>
          <p className={SOLO_TYPE.hero} style={row.streak > 0 ? { color: MEASURE_BLUE } : undefined}>
            {row.streak}
          </p>
          <p className={`${SOLO_TYPE.eyebrow} mt-2`} style={{ color: t.textMuted }}>
            {row.streak === 1 ? "Team week in a row" : "Team weeks in a row"}
          </p>
          <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t" style={{ borderColor: t.panelBorder }}>
            <div>
              <p className={SOLO_TYPE.figure}>
                {row.me.done}/{row.me.target}
              </p>
              <p className={`${SOLO_TYPE.meta} mt-1`} style={{ color: t.textMuted }}>
                You this week
              </p>
            </div>
            <div>
              <p className={SOLO_TYPE.figure}>
                {row.them.done}/{row.them.target}
              </p>
              <p className={`${SOLO_TYPE.meta} mt-1 truncate`} style={{ color: t.textMuted }}>
                {row.name} this week
              </p>
            </div>
          </div>
          {last && (
            <p className={`${SOLO_TYPE.body} mt-5`} style={{ color: t.textMuted }}>
              {row.name} last trained {lastLabel(last.dateKey, todayKey)}: {last.title}.
            </p>
          )}
          <p className={`${SOLO_TYPE.body} mt-3`} style={{ color: t.textMuted }}>
            A week counts when you both hit your own sessions. Miss one and the streak starts again.
          </p>
          <SoloTextButton t={t} className="mt-6" onClick={end}>
            <span style={{ color: "#EF4444" }}>{confirming ? `Tap again to stop training with ${row.name}` : "Stop training together"}</span>
          </SoloTextButton>
          {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        </div>
      )}
    </BottomSheet>
  );
}

function lastLabel(key, todayKey) {
  const label = sessionDayLabel(key, todayKey);
  return label === "Today" || label === "Yesterday" ? label.toLowerCase() : `on ${label}`;
}
