import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Lock, Check, GripVertical } from "lucide-react";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES, soloGlass } from "./SoloThemeContext";
import { localDateKey } from "../lib/dateKey";
import { MEASURE_BLUE } from "../theme";
import { buildSoloCalendar, rangeKeys, addDays, calendarItemTarget, canMoveItem, planMove } from "./soloCalendar";
import { canUse } from "./soloAccess";
import { SoloPageHeader } from "./SoloUI";
import { isRecoveryAddon } from "./recommendations";

// Train Solo's Calendar tab (#171) — a scrolling day-by-day list built
// from the member's own programs, logs and weekly Monday check-ins (see
// soloCalendar.js). Moving a session works exactly like the coached client
// app's calendar (ClientApp.jsx ClientCalendarScreen): every day is listed,
// a session still to do has a grip handle; hold it, drag onto a day (the
// list auto-scrolls at its edges), let go. The write is canMoveItem /
// planMove — the same sessionPlan / plannedSessions records the missed-
// session move and the Plan sheet use, never logs.
// The tab bar's height (SoloShell NAV_SPACE).
const NAV_SPACE = "calc(64px + env(safe-area-inset-bottom,0px))";

export default function SoloCalendarScreen() {
  const navigate = useNavigate();
  const { soloCurrentUser, soloTrainingPrograms, soloProgramsById, soloContentById, soloWorkoutLogs, soloWeighIns, soloBodyMetrics, soloProgressPhotos, soloAccess, soloCustomSessions, setSoloSessionPlan, planSoloSession } =
    useSoloApp();
  const { dark, accent } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const [daysBack, setDaysBack] = useState(30);
  const [daysForward, setDaysForward] = useState(60);
  const scrollRef = useRef(null);
  const todayRef = useRef(null);
  const scrolledToToday = useRef(false);
  const prependAdjustRef = useRef(null);
  const todayKey = localDateKey();

  const programsById = soloProgramsById;
  const addonProgram = programsById[soloCurrentUser?.recoveryAddon?.programId];
  // Recovery add-ons are a Plus feature once subscriptions launch.
  const recoveryAddon = addonProgram && addonProgram.status === "published" && isRecoveryAddon(addonProgram) && canUse("recoveryAddons", soloAccess) ? addonProgram : null;
  const { fromKey, toKey } = rangeKeys(daysBack, daysForward, todayKey);
  const byDate = useMemo(
    () =>
      buildSoloCalendar({
        purchases: soloTrainingPrograms,
        programsById,
        contentByProgramId: soloContentById,
        workoutLogs: soloWorkoutLogs,
        weighIns: soloWeighIns,
        bodyMetrics: soloBodyMetrics,
        progressPhotos: soloProgressPhotos,
        recoveryAddon,
        accountCreatedAt: soloCurrentUser?.createdAt,
        trainingDays: soloCurrentUser?.onboarding?.answers?.trainingDays,
        sessionPlan: soloCurrentUser?.sessionPlan,
        plannedSessions: soloCurrentUser?.plannedSessions,
        customSessions: soloCustomSessions,
        fromKey,
        toKey,
      }),
    [soloTrainingPrograms, programsById, soloContentById, soloWorkoutLogs, soloWeighIns, soloBodyMetrics, soloProgressPhotos, recoveryAddon, soloCurrentUser?.createdAt, soloCurrentUser?.onboarding?.answers?.trainingDays, soloCurrentUser?.sessionPlan, soloCurrentUser?.plannedSessions, soloCustomSessions, fromKey, toKey]
  );

  // Every day, like the client calendar, so any day can take a session.
  const days = useMemo(() => {
    const list = [];
    for (let key = fromKey; key <= toKey; key = addDays(key, 1)) list.push(key);
    return list;
  }, [fromKey, toKey]);

  useEffect(() => {
    if (scrolledToToday.current) return;
    const id = setTimeout(() => {
      todayRef.current?.scrollIntoView({ block: "start" });
      scrolledToToday.current = true;
    }, 50);
    return () => clearTimeout(id);
  }, [days]);

  // Older days are inserted above what's on screen; keep the viewport
  // pinned to the same content instead of letting it jump.
  useLayoutEffect(() => {
    if (prependAdjustRef.current == null) return;
    const el = scrollRef.current;
    if (el) el.scrollTop += el.scrollHeight - prependAdjustRef.current;
    prependAdjustRef.current = null;
  }, [days]);

  function handleScroll(e) {
    const el = e.target;
    if (el.scrollTop < 300 && daysBack < 365) {
      prependAdjustRef.current = el.scrollHeight;
      setDaysBack((d) => Math.min(d + 30, 365));
    }
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) setDaysForward((d) => Math.min(d + 30, 365));
  }

  // --- Drag to move (#171), the client calendar's mechanics ---
  const [dragItem, setDragItem] = useState(null);
  const [dragOverDate, setDragOverDate] = useState(null);
  const [dragPos, setDragPos] = useState(null);
  const pressRef = useRef(null);
  const scrollSpeedRef = useRef(0);
  const autoScrollRafRef = useRef(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const suppressClickRef = useRef(false);
  const ghostRef = useRef(null);
  const dragOverDateRef = useRef(null);

  useLayoutEffect(() => {
    if (ghostRef.current && dragPos) {
      ghostRef.current.style.left = `${dragPos.x}px`;
      ghostRef.current.style.top = `${dragPos.y}px`;
    }
  }, [dragPos]);

  function recheckDragOverDate() {
    const { x, y } = lastPointerRef.current;
    const target = document.elementFromPoint?.(x, y);
    const overDate = target?.closest?.("[data-date]")?.getAttribute("data-date") || null;
    const next = overDate && overDate !== pressRef.current?.item.dateKey && overDate >= todayKey ? overDate : null;
    if (next !== dragOverDateRef.current) {
      dragOverDateRef.current = next;
      setDragOverDate(next);
    }
  }
  function autoScrollTick() {
    const { x, y } = lastPointerRef.current;
    if (ghostRef.current) {
      ghostRef.current.style.left = `${x}px`;
      ghostRef.current.style.top = `${y}px`;
    }
    const el = scrollRef.current;
    if (el && scrollSpeedRef.current !== 0) el.scrollTop += scrollSpeedRef.current;
    recheckDragOverDate();
    autoScrollRafRef.current = requestAnimationFrame(autoScrollTick);
  }
  function updateAutoScroll(clientY) {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const edge = 70;
    let speed = 0;
    if (clientY < rect.top + edge) speed = -(Math.round((rect.top + edge - clientY) / 3) + 3);
    else if (clientY > rect.bottom - edge) speed = Math.round((clientY - (rect.bottom - edge)) / 3) + 3;
    scrollSpeedRef.current = speed;
  }
  function startDragLoop() {
    if (autoScrollRafRef.current) return;
    autoScrollRafRef.current = requestAnimationFrame(autoScrollTick);
  }
  function stopAutoScroll() {
    scrollSpeedRef.current = 0;
    if (autoScrollRafRef.current) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
    dragOverDateRef.current = null;
  }
  // A drag left stuck (iOS took the touch mid-gesture): the next tap clears it.
  useEffect(() => {
    if (!dragItem) return;
    function recover() {
      setDragItem(null);
      setDragOverDate(null);
      setDragPos(null);
      pressRef.current = null;
      stopAutoScroll();
    }
    document.addEventListener("pointerdown", recover, true);
    return () => document.removeEventListener("pointerdown", recover, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragItem]);

  function cardPointerDown(e, item) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    const timer = setTimeout(() => {
      if (!pressRef.current) return;
      pressRef.current.fired = true;
      lastPointerRef.current = { x: startX, y: startY };
      setDragItem(item);
      setDragPos({ x: startX, y: startY });
      try {
        el.setPointerCapture(pointerId);
      } catch {
        // iOS touch pointers can throw
      }
      if (navigator.vibrate) navigator.vibrate(10);
      startDragLoop();
    }, 220);
    pressRef.current = { timer, startX, startY, item, fired: false };
  }
  function cardPointerMove(e) {
    const p = pressRef.current;
    if (!p) return;
    if (!p.fired) {
      if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 14) {
        clearTimeout(p.timer);
        pressRef.current = null;
      }
      return;
    }
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    updateAutoScroll(e.clientY);
  }
  function cardPointerUp() {
    const p = pressRef.current;
    if (p?.fired) {
      suppressClickRef.current = true;
      const overDate = dragOverDateRef.current;
      if (overDate) moveTo(p.item, overDate);
    }
    if (p?.timer) clearTimeout(p.timer);
    pressRef.current = null;
    setDragItem(null);
    setDragOverDate(null);
    setDragPos(null);
    stopAutoScroll();
  }
  async function moveTo(item, toKey) {
    const write = planMove(item, toKey, todayKey);
    if (!write) return;
    try {
      if (write.kind === "planned") await planSoloSession(soloCurrentUser.id, write.planId, write.sessionId, write.date);
      else await setSoloSessionPlan(soloCurrentUser.id, write.purchaseId, write.key, write.value);
    } catch {
      // Refused by the server: it stays where it was.
    }
  }

  function actionFor(item) {
    const target = calendarItemTarget(item, { todayKey, soloUid: soloCurrentUser.id, contentByProgramId: soloContentById });
    return target ? () => navigate(target.path, target.state ? { state: target.state } : undefined) : null;
  }

  return (
    // Exactly the space above the tab bar; only the day list scrolls.
    <div className="w-full flex flex-col" style={{ height: `calc(100dvh - ${NAV_SPACE})`, backgroundColor: t.bg, color: t.text }}>
      <SoloPageHeader
        t={t}
        title="Calendar"
        className="w-full max-w-md mx-auto shrink-0"
        sub={
          <p className="text-xs" style={{ color: t.textMuted }} data-testid="calendar-move-hint">
            Hold a workout and drag it to another day to move it.
          </p>
        }
        right={
          <button
            onClick={() => todayRef.current?.scrollIntoView({ block: "start", behavior: "smooth" })}
            className="text-sm font-semibold shrink-0 pt-1"
            style={{ color: t.textMuted }}
          >
            Today
          </button>
        }
      />

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto">
        <div className="w-full max-w-md mx-auto px-3 pb-10">
          {days.map((key, i) => {
            const isToday = key === todayKey;
            const items = byDate[key] || [];
            const date = new Date(`${key}T00:00:00`);
            const isDropTarget = !!dragItem && dragOverDate === key;
            return (
              <div
                key={key}
                data-date={key}
                ref={isToday ? todayRef : null}
                className={`${i > 0 ? "mt-6" : ""} rounded-2xl transition-colors duration-150`}
                style={{ scrollMarginTop: 8, ...(isDropTarget ? { boxShadow: `0 0 0 2px ${MEASURE_BLUE}`, backgroundColor: `${MEASURE_BLUE}14` } : null) }}
              >
                {/* The date as a large figure, today ringed and lit (#196). */}
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className="w-10 h-10 rounded-full flex items-center justify-center text-[17px] font-extrabold tabular-nums shrink-0"
                    style={{
                      color: isToday ? accent : t.text,
                      border: `1.5px solid ${isToday ? accent : "transparent"}`,
                      boxShadow: isToday && t.bg !== "#FFFFFF" ? `0 0 12px ${accent}66` : "none",
                    }}
                  >
                    {date.getDate()}
                  </span>
                  <p className="font-bold text-[12px] uppercase tracking-[0.12em]" style={{ color: isToday ? accent : t.textMuted }}>
                    {isToday ? "Today, " : ""}
                    {date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                  </p>
                </div>
                <div className="mb-3" style={{ borderBottom: `1px solid ${t.panelBorder}` }} />
                <div className="space-y-2.5">
                  {items.length === 0 && (
                    <p className="text-sm px-1" style={{ color: t.textFaint }}>
                      Nothing scheduled.
                    </p>
                  )}
                  {items.map((item) => {
                    const action = actionFor(item);
                    const movable = canMoveItem(item, todayKey);
                    const locked = (item.type === "workout" || item.type === "addon" || item.type === "planned") && !item.done && !action && !movable;
                    const dragging = dragItem?.id === item.id;
                    const open = () => {
                      // The click that ends a drag isn't a tap on the card.
                      if (suppressClickRef.current) {
                        suppressClickRef.current = false;
                        return;
                      }
                      action?.();
                    };
                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={action ? 0 : -1}
                        onClick={open}
                        className={`w-full flex items-center gap-3 rounded-2xl pl-4 pr-4 py-3.5 text-left transition-transform ${dragging ? "opacity-30 scale-[0.97]" : ""}`}
                        style={{ ...soloGlass(t), cursor: action ? "pointer" : "default" }}
                      >
                        <span
                          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                          style={{ border: `2px solid ${accent}`, backgroundColor: item.done ? accent : "transparent" }}
                        >
                          {item.done && <Check size={11} color="#fff" strokeWidth={3} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate" style={{ textDecoration: item.done ? "line-through" : "none", opacity: item.done ? 0.6 : 1 }}>
                            {item.title}
                          </p>
                          <p className="text-xs mt-0.5 truncate" style={{ color: t.textMuted }}>
                            {item.done ? (item.type === "workout" || item.type === "recovery" || item.type === "addon" || item.type === "custom" || item.type === "planned" ? "Completed." : "Done for this week.") : item.subtitle}
                          </p>
                        </div>
                        {movable ? (
                          // The client calendar's grab handle: it alone owns
                          // the drag (touchAction none), so the card still
                          // scrolls and taps normally.
                          <span
                            data-testid="drag-handle"
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              cardPointerDown(e, item);
                            }}
                            onPointerMove={(e) => {
                              e.stopPropagation();
                              cardPointerMove(e);
                            }}
                            onPointerUp={(e) => {
                              e.stopPropagation();
                              cardPointerUp(e);
                            }}
                            onPointerCancel={(e) => {
                              e.stopPropagation();
                              cardPointerUp(e);
                            }}
                            aria-label={`Move ${item.title}`}
                            className="w-11 h-11 -mr-2.5 shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
                            style={{ color: t.textFaint, touchAction: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
                          >
                            <GripVertical size={20} />
                          </span>
                        ) : locked ? (
                          <Lock size={14} color={t.textFaint} className="shrink-0" />
                        ) : action ? (
                          <ChevronRight size={16} color={t.textFaint} className="shrink-0" />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {dragItem && (
        // The session being dragged follows the finger (positioned from the
        // drag loop, like the client calendar).
        <div
          ref={ghostRef}
          data-testid="drag-ghost"
          className="fixed z-[90] pointer-events-none rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg -translate-x-1/2 -translate-y-[130%]"
          style={{ ...soloGlass(t), width: 240, color: t.text }}
        >
          {dragItem.title}
        </div>
      )}
    </div>
  );
}
