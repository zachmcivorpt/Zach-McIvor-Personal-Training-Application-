// Coached client weekly review (#240): the page (frosted glass over the
// softly blurred APEX gym photo, like the video feedback page #220, in the
// client's own light/dark) and the "Weekly reviews" list at the bottom of
// Progress. Also used on the coach's client Progress tab (coachView, dark).
// Loaded on its own (React.lazy) so it's never on the launch path. Every
// figure comes from coachedWeekReview (src/lib/weeklyReview.js).
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronRight, TrendingUp } from "lucide-react";
import { MEASURE_BLUE, CLIENT_DARK_BG } from "../theme";
import { Card as PageCard } from "../components/ui";
import { reviewWeeks, reviewSummary, reviewIsFresh, coachedWeekReview } from "../lib/weeklyReview";

const GLASS_DARK = {
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.11)",
  backdropFilter: "blur(26px) saturate(140%)",
  WebkitBackdropFilter: "blur(26px) saturate(140%)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 20px 60px -30px rgba(0,0,0,0.8)",
};
// Light: white glass on a near-white page (#241, owner: "more glassy white,
// less grey").
const GLASS_LIGHT = {
  background: "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.38))",
  border: "1px solid rgba(255,255,255,0.9)",
  backdropFilter: "blur(30px) saturate(190%) brightness(1.06)",
  WebkitBackdropFilter: "blur(30px) saturate(190%) brightness(1.06)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(255,255,255,0.35), 0 14px 36px -26px rgba(20,30,60,0.28)",
};
const BLUE_GLASS = { background: "rgba(47,143,255,0.12)", border: "1px solid rgba(47,143,255,0.5)", backdropFilter: "blur(26px)", WebkitBackdropFilter: "blur(26px)", boxShadow: "0 0 18px rgba(47,143,255,0.18)" };

const kg = (n) => Math.round(n || 0).toLocaleString("en-AU");
const signed = (n, unit) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n)}${unit}`;
const fmtRange = (r) => {
  const f = (k) => new Date(`${k}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  return `${f(r.monday)} – ${f(r.sunday)}`;
};
const sleepText = (h) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, "0")} m`;

function useTone(dark) {
  return {
    glass: dark ? GLASS_DARK : GLASS_LIGHT,
    text: dark ? "#FFFFFF" : "#0A0A0B",
    muted: dark ? "rgba(255,255,255,0.55)" : "rgba(10,10,11,0.5)",
    faint: dark ? "rgba(255,255,255,0.38)" : "rgba(10,10,11,0.38)",
    line: dark ? "rgba(255,255,255,0.1)" : "rgba(10,10,11,0.08)",
    chip: dark ? "rgba(255,255,255,0.08)" : "rgba(10,10,11,0.045)",
  };
}

function Card({ tone, children, style, testid }) {
  return (
    <div className="rounded-[20px] px-4 py-3" style={{ ...tone.glass, ...style }} data-testid={testid}>
      {children}
    </div>
  );
}
function Label({ tone, children, color }) {
  return <p className="text-[10px] font-semibold tracking-[0.16em] uppercase" style={{ color: color || tone.faint }}>{children}</p>;
}
function Row({ tone, title, sub, value, valueColor, first }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2" style={first ? undefined : { borderTop: `1px solid ${tone.line}` }}>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold leading-tight">{title}</span>
        {sub && <span className="block text-[11px] leading-tight mt-0.5 tabular-nums" style={{ color: tone.muted }}>{sub}</span>}
      </span>
      <span className="text-[15px] font-semibold tabular-nums shrink-0" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </span>
    </div>
  );
}

export function WeeklyReviewPage({ review: r, dark, onClose, checkInDue = false, onCheckIn, coachView = false, clientName }) {
  const tone = useTone(dark);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = prev;
    };
  }, []);
  const s = r.sessions;
  const hero = s.planned > 0 ? `${s.done} of ${s.planned}` : String(s.total);
  const n = r.nutrition;
  const bodyRows = [
    r.weight.avg !== null && { title: "Bodyweight", sub: `Average ${r.weight.avg} kg`, value: r.weight.change !== null ? signed(r.weight.change, " kg") : `${r.weight.avg} kg` },
    r.steps.avg !== null && { title: "Steps", sub: "Daily average", value: r.steps.avg.toLocaleString("en-AU") },
    r.sleep.avg !== null && { title: "Sleep", sub: "Nightly average", value: sleepText(r.sleep.avg) },
  ].filter(Boolean);

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex flex-col overflow-hidden"
      style={{ backgroundColor: dark ? CLIENT_DARK_BG : "#FFFFFF", color: tone.text, opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(12px)", transition: "opacity 0.28s ease, transform 0.32s cubic-bezier(.2,.8,.2,1)" }}
      role="dialog"
      aria-label="Weekly review"
      data-testid="weekly-review-page"
    >
      <img
        src="/brand/gym-dark.jpg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 w-full h-full object-cover"
        style={{ filter: dark ? "blur(30px) brightness(0.55)" : "blur(22px) grayscale(1) invert(1) contrast(0.85) brightness(1.08)", transform: "scale(1.15)", opacity: dark ? 0.9 : 0.55 }}
      />
      <div className="relative shrink-0 flex items-center gap-2 px-2 pt-[max(1.25rem,env(safe-area-inset-top))] pb-2">
        <button type="button" onClick={onClose} aria-label="Back" className="w-10 h-10 rounded-full flex items-center justify-center" style={tone.glass}>
          <ArrowLeft size={20} />
        </button>
        <p className="flex-1 min-w-0 text-center font-semibold text-[17px] truncate">{coachView && clientName ? `${clientName}'s week` : "Weekly review"}</p>
        <span className="w-10" />
      </div>

      <div className="relative flex-1 overflow-y-auto overscroll-contain px-2 pb-16 space-y-1.5 max-w-xl w-full mx-auto" style={{ WebkitOverflowScrolling: "touch" }}>
        <Card tone={tone} testid="review-hero">
          <Label tone={tone}>{fmtRange(r)}</Label>
          <h1 className="text-[19px] leading-[1.15] font-semibold tracking-[-0.02em] mt-1">{r.headline}</h1>
          <p className="text-[34px] leading-none font-semibold tracking-[-0.035em] tabular-nums mt-2.5" data-testid="review-hero-figure">
            {hero}
          </p>
          <p className="text-[12px] mt-1" style={{ color: tone.muted }}>
            {s.planned > 0 ? "planned sessions done" : s.total === 1 ? "session done" : "sessions done"}
          </p>
          <div className="flex gap-1 mt-2.5">
            {r.days.map((d) => (
              <span
                key={d.dateKey}
                className="flex-1 h-6 rounded-lg flex items-end justify-center pb-[3px] text-[9px] font-semibold"
                style={d.trained ? { background: "rgba(47,143,255,0.85)", color: "#fff", boxShadow: "0 0 12px rgba(47,143,255,0.35)" } : { background: tone.chip, color: tone.muted, border: d.planned ? `1px solid ${MEASURE_BLUE}` : "1px solid transparent" }}
              >
                {new Date(`${d.dateKey}T12:00:00`).toLocaleDateString("en-AU", { weekday: "narrow" })}
              </span>
            ))}
          </div>
        </Card>

        <Card tone={tone}>
          <div className="grid grid-cols-[1fr_1.4fr_0.8fr] gap-x-3">
            {[
              [r.minutes === null ? "–" : r.minutes, "Minutes"],
              [r.lifted.kg === null ? "–" : kg(r.lifted.kg), r.lifted.changePct === null ? "Kg lifted" : `Kg lifted · ${r.lifted.changePct >= 0 ? "+" : ""}${r.lifted.changePct}%`],
              [r.prs, "PRs", r.prs > 0],
            ].map(([v, label, blue]) => (
              <div key={label} className="min-w-0">
                <p className="text-[20px] leading-none font-semibold tracking-[-0.03em] tabular-nums whitespace-nowrap" style={blue ? { color: MEASURE_BLUE } : undefined}>
                  {v}
                </p>
                <p className="text-[11px] mt-1.5" style={{ color: tone.muted }}>
                  {label}
                </p>
              </div>
            ))}
          </div>
          {r.streak > 0 && (
            <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: `1px solid ${tone.line}` }} data-testid="review-consistency">
              <span className="text-[13px] font-semibold">Consistency</span>
              <span className="text-[15px] font-semibold tabular-nums">
                {r.streak} week{r.streak === 1 ? "" : "s"} in a row
              </span>
            </div>
          )}
        </Card>

        {n && n.logged > 0 && (
          <Card tone={tone} testid="review-nutrition">
            <Label tone={tone}>Nutrition</Label>
            <div className="mt-0.5">
              {n.calorieTarget && <Row tone={tone} first title="Calories on target" sub={`Within your ${n.calorieTarget.toLocaleString("en-AU")} kcal goal`} value={`${n.calorieHits} of 7 days`} />}
              {n.proteinTarget && <Row tone={tone} first={!n.calorieTarget} title="Protein hit" sub={`${n.proteinTarget} g a day`} value={`${n.proteinHits} of 7 days`} />}
            </div>
          </Card>
        )}

        {bodyRows.length > 0 && (
          <Card tone={tone} testid="review-body">
            <Label tone={tone}>Body</Label>
            <div className="mt-0.5">
              {bodyRows.map((row, i) => (
                <Row key={row.title} tone={tone} first={i === 0} {...row} />
              ))}
            </div>
          </Card>
        )}

        {r.stronger.length > 0 && (
          <Card tone={tone} testid="review-stronger">
            <Label tone={tone}>Stronger</Label>
            <div className="mt-0.5">
              {r.stronger.map((g, i) => (
                <Row key={g.id} tone={tone} first={i === 0} title={g.name} sub={`Est. max ${g.from} → ${g.to} kg`} value={`+${g.change} kg`} valueColor={MEASURE_BLUE} />
              ))}
            </div>
          </Card>
        )}

        {(r.phase || r.insights.length > 0) && (
          <Card tone={tone}>
            {r.phase && (
              <div className={r.insights.length ? "pb-2.5" : ""} style={r.insights.length ? { borderBottom: `1px solid ${tone.line}` } : undefined} data-testid="review-phase">
                <Label tone={tone}>Your phase</Label>
                <div className="flex items-baseline justify-between gap-3 mt-1.5">
                  <span className="text-[13px] font-semibold min-w-0 truncate">
                    {r.phase.name}
                    {r.phase.total ? ` · Week ${r.phase.week} of ${r.phase.total}` : ` · Week ${r.phase.week}`}
                  </span>
                  {r.phase.pct !== null && <span className="text-[16px] font-semibold tabular-nums shrink-0">{Math.round(r.phase.pct * 100)}%</span>}
                </div>
                {r.phase.pct !== null && (
                  <span className="block h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: tone.chip }}>
                    <span className="block h-full rounded-full" style={{ width: `${Math.round(r.phase.pct * 100)}%`, background: MEASURE_BLUE }} />
                  </span>
                )}
              </div>
            )}
            {r.insights.map((text) => (
              <p key={text} className="flex items-start gap-2 text-[12.5px] leading-snug mt-2" style={{ color: tone.muted }}>
                <TrendingUp size={15} color={MEASURE_BLUE} className="shrink-0 mt-[3px]" />
                <span>{text}</span>
              </p>
            ))}
          </Card>
        )}

        <div className="rounded-[20px] px-4 py-3" style={BLUE_GLASS} data-testid="review-focus">
          <Label tone={tone} color={MEASURE_BLUE}>
            Next week's focus
          </Label>
          <p className="text-[15px] leading-snug font-semibold mt-1.5">{r.focus}</p>
        </div>

        <div className="pt-3 px-2">
          {!coachView && checkInDue ? (
            <>
              <button
                type="button"
                onClick={onCheckIn}
                className="w-full h-12 rounded-2xl text-[13px] font-bold uppercase tracking-[0.02em]"
                style={{ background: tone.text, color: dark ? "#000" : "#fff" }}
              >
                Log this week's check-in
              </button>
              <button type="button" onClick={onClose} className="w-full h-11 text-[12px] font-semibold" style={{ color: tone.muted }}>
                Skip for now
              </button>
            </>
          ) : (
            <button type="button" onClick={onClose} className="w-full h-12 rounded-2xl text-[13px] font-bold uppercase tracking-[0.02em]" style={tone.glass}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

const seenKey = (uid) => `apexWeeklyReviewSeen:${uid}`;
function readSeen(uid) {
  try {
    return localStorage.getItem(seenKey(uid)) || "";
  } catch {
    return "";
  }
}
export function markReviewSeen(uid, monday) {
  try {
    if (readSeen(uid) < monday) localStorage.setItem(seenKey(uid), monday);
  } catch {
    /* storage blocked */
  }
}

// "Weekly reviews" at the bottom of Progress: newest first, the new one
// marked until opened. Each opens the review page.
export default function WeeklyReviewsSection({ uid, data, dark, checkInDue = false, onCheckIn, coachView = false, clientName, autoOpen = false, hideList = false, nowMs, openLatest = false, onClosed }) {
  const tone = useTone(dark);
  const weeks = useMemo(() => reviewWeeks(data, { nowMs: nowMs ?? Date.now() }), [data, nowMs]);
  const [open, setOpen] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const seen = coachView ? "" : readSeen(uid);

  // Sunday 6pm to Tuesday: the new review opens by itself once (the
  // notification's tap only opens the app). Marked seen as it shows.
  useEffect(() => {
    if (!autoOpen || coachView || !uid || !weeks[0]) return;
    const latest = weeks[0];
    if (reviewIsFresh(latest.monday, nowMs ?? Date.now()) && readSeen(uid) < latest.monday) {
      markReviewSeen(uid, latest.monday);
      setOpen(latest.monday);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, uid, weeks[0]?.monday]);

  // Home's "Your weekly review" row (#248) opens the latest week straight away.
  useEffect(() => {
    if (!openLatest) return;
    if (weeks[0]) openWeek(weeks[0].monday);
    else onClosed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openLatest]);

  function openWeek(monday) {
    if (!coachView) markReviewSeen(uid, monday);
    setOpen(monday);
  }

  const review = open ? weeks.find((w) => w.monday === open) || coachedWeekReview({ ...data, monday: open }) : null;
  const list = showAll ? weeks : weeks.slice(0, 4);

  return (
    <>
      {weeks.length > 0 && !hideList && (
        <div data-testid="weekly-reviews">
          <p className="font-semibold mb-1" style={{ color: tone.text }}>
            Weekly reviews
          </p>
          <p className="text-xs mb-3" style={{ color: tone.muted }}>
            {coachView ? "Their week in one page, every Sunday." : "Every Sunday, your week in one page."}
          </p>
          {/* Same card as the rest of Progress (glass on the coach's page). */}
          <PageCard dark={dark} className="!py-0 !px-4">
            {list.map((w, i) => {
              const isNew = !coachView && w.monday > seen && reviewIsFresh(w.monday, nowMs ?? Date.now());
              const d = new Date(`${w.sunday}T12:00:00`);
              return (
                <button
                  key={w.monday}
                  type="button"
                  onClick={() => openWeek(w.monday)}
                  className="w-full flex items-center gap-3 py-3 text-left"
                  style={i > 0 ? { borderTop: `1px solid ${tone.line}` } : undefined}
                >
                  <span className="w-10 shrink-0 text-center leading-none">
                    <span className="block text-[10px] font-bold uppercase tracking-wide" style={{ color: tone.faint }}>
                      {d.toLocaleDateString("en-AU", { month: "short" })}
                    </span>
                    <span className="block text-xl font-extrabold tabular-nums mt-1" style={{ color: isNew ? MEASURE_BLUE : tone.text }}>
                      {d.getDate()}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold truncate" style={{ color: tone.text }}>
                      {w.headline}
                    </span>
                    <span className="block text-xs mt-0.5 truncate tabular-nums" style={{ color: tone.muted }}>
                      {reviewSummary(w)}
                    </span>
                  </span>
                  {isNew && <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: MEASURE_BLUE }}>New</span>}
                  <ChevronRight size={16} color={tone.faint} className="shrink-0" />
                </button>
              );
            })}
          </PageCard>
          {weeks.length > 4 && !showAll && (
            <button type="button" onClick={() => setShowAll(true)} className="block mx-auto mt-2 text-xs font-semibold" style={{ color: tone.muted }}>
              Show all {weeks.length}
            </button>
          )}
        </div>
      )}
      {review && (
        <WeeklyReviewPage
          review={review}
          dark={dark}
          coachView={coachView}
          clientName={clientName}
          checkInDue={checkInDue}
          onClose={() => {
            setOpen(null);
            onClosed?.();
          }}
          onCheckIn={() => {
            setOpen(null);
            onClosed?.();
            onCheckIn?.();
          }}
        />
      )}
    </>
  );
}
