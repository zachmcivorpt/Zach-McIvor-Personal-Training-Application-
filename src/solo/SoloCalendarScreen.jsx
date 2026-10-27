import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Lock, Check } from "lucide-react";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES, soloGlass } from "./SoloThemeContext";
import { localDateKey } from "../lib/dateKey";
import { buildSoloCalendar, rangeKeys, addDays, calendarItemTarget } from "./soloCalendar";
import { isRecoveryAddon } from "./recommendations";

// Train Solo's calendar (Profile → My Calendar) — the same scrolling
// day-by-day list the coached client's Calendar tab uses, built from the
// customer's own programs, logs and weekly Monday check-ins (see
// soloCalendar.js). Read-only: nothing here is rescheduled by dragging,
// since a Solo program's days are laid out from its start date.
export default function SoloCalendarScreen() {
  const navigate = useNavigate();
  const { soloCurrentUser, soloPurchases, soloPrograms, soloProgramContentByProgramId, soloWorkoutLogs, soloWeighIns, soloBodyMetrics, soloProgressPhotos } =
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

  const programsById = useMemo(() => Object.fromEntries(soloPrograms.map((p) => [p.id, p])), [soloPrograms]);
  const addonProgram = programsById[soloCurrentUser?.recoveryAddon?.programId];
  const recoveryAddon = addonProgram && addonProgram.status === "published" && isRecoveryAddon(addonProgram) ? addonProgram : null;
  const { fromKey, toKey } = rangeKeys(daysBack, daysForward, todayKey);
  const byDate = useMemo(
    () =>
      buildSoloCalendar({
        purchases: soloPurchases,
        programsById,
        contentByProgramId: soloProgramContentByProgramId,
        workoutLogs: soloWorkoutLogs,
        weighIns: soloWeighIns,
        bodyMetrics: soloBodyMetrics,
        progressPhotos: soloProgressPhotos,
        recoveryAddon,
        accountCreatedAt: soloCurrentUser?.createdAt,
        trainingDays: soloCurrentUser?.onboarding?.answers?.trainingDays,
        fromKey,
        toKey,
      }),
    [soloPurchases, programsById, soloProgramContentByProgramId, soloWorkoutLogs, soloWeighIns, soloBodyMetrics, soloProgressPhotos, recoveryAddon, soloCurrentUser?.createdAt, soloCurrentUser?.onboarding?.answers?.trainingDays, fromKey, toKey]
  );

  // Only days with something on them, plus today so the list always has
  // an anchor to scroll to.
  const days = useMemo(() => {
    const list = [];
    for (let key = fromKey; key <= toKey; key = addDays(key, 1)) {
      if (byDate[key] || key === todayKey) list.push(key);
    }
    return list;
  }, [byDate, fromKey, toKey, todayKey]);

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

  function actionFor(item) {
    const target = calendarItemTarget(item, { todayKey, soloUid: soloCurrentUser.id, contentByProgramId: soloProgramContentByProgramId });
    return target ? () => navigate(target.path, target.state ? { state: target.state } : undefined) : null;
  }

  return (
    <div className="min-h-dvh w-full flex flex-col" style={{ backgroundColor: t.bg, color: t.text }}>
      <div className="w-full max-w-md mx-auto px-3 pt-5 pb-3 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => navigate("/solo/home", { state: { soloTab: "profile" } })}
            aria-label="Back"
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={soloGlass(t)}
          >
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold leading-tight">Calendar</h1>
            <p className="text-xs" style={{ color: t.textMuted }}>
              Scroll to see anything past or upcoming.
            </p>
          </div>
        </div>
        <button
          onClick={() => todayRef.current?.scrollIntoView({ block: "start", behavior: "smooth" })}
          className="text-sm font-semibold shrink-0"
          style={{ color: t.textMuted }}
        >
          Today
        </button>
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto" style={{ maxHeight: "calc(100dvh - 84px)" }}>
        <div className="w-full max-w-md mx-auto px-3 pb-10">
          {days.map((key, i) => {
            const isToday = key === todayKey;
            const items = byDate[key] || [];
            const date = new Date(`${key}T00:00:00`);
            return (
              <div key={key} ref={isToday ? todayRef : null} className={i > 0 ? "mt-6" : ""} style={{ scrollMarginTop: 8 }}>
                <p className="font-bold text-base mb-2" style={{ color: isToday ? accent : t.text }}>
                  {isToday ? "Today, " : ""}
                  {date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                </p>
                <div className="mb-3" style={{ borderBottom: `1px solid ${t.panelBorder}` }} />
                <div className="space-y-2.5">
                  {items.length === 0 && (
                    <p className="text-sm px-1" style={{ color: t.textFaint }}>
                      Nothing scheduled.
                    </p>
                  )}
                  {items.map((item) => {
                    const action = actionFor(item);
                    const locked = (item.type === "workout" || item.type === "addon") && !item.done && !action;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={action || undefined}
                        disabled={!action}
                        className="w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left disabled:cursor-default"
                        style={soloGlass(t)}
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
                            {item.done ? (item.type === "workout" || item.type === "recovery" || item.type === "addon" || item.type === "custom" ? "Completed." : "Done for this week.") : item.subtitle}
                          </p>
                        </div>
                        {locked ? <Lock size={14} color={t.textFaint} className="shrink-0" /> : action ? <ChevronRight size={16} color={t.textFaint} className="shrink-0" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
