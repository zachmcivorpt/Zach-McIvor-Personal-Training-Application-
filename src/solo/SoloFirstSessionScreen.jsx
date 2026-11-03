import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Play, ChevronRight } from "lucide-react";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES, soloGlass } from "./SoloThemeContext";
import { SoloButton, SoloTextButton, SOLO_TYPE } from "./SoloUI";
import { SoloArtwork } from "./SoloArtwork";
import { customSessionState } from "./customSessions";
import { recommendForAnswers } from "./recommendations";
import { starterSession } from "./firstSession";

// Straight after the questionnaire (#141): the first session, today. A
// short full-body session from the equipment they said they have
// (firstSession.js), on every plan; their recommended program sits below
// for afterwards. "Later" goes to the app as before.
export default function SoloFirstSessionScreen() {
  const navigate = useNavigate();
  const { soloCurrentUser, soloExercises, soloPrograms, soloProgramCategories } = useSoloApp();
  const { dark } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const answers = soloCurrentUser?.onboarding?.answers || {};
  const session = useMemo(() => starterSession(soloExercises || [], answers), [soloExercises, answers]);
  const exercisesById = useMemo(() => Object.fromEntries((soloExercises || []).map((e) => [e.id, e])), [soloExercises]);
  const recommended = useMemo(() => recommendForAnswers(soloPrograms || [], soloProgramCategories || [], answers, { limit: 1 }).programs[0] || null, [soloPrograms, soloProgramCategories, answers]);
  const firstName = (soloCurrentUser?.name || "").trim().split(/\s+/)[0];

  function start() {
    if (!soloCurrentUser) return;
    navigate("/solo/workout", { replace: true, state: customSessionState(soloCurrentUser.id, session) });
  }

  return (
    <div className="min-h-dvh w-full" style={{ backgroundColor: t.bg, color: t.text }}>
      <div className="max-w-md mx-auto px-5 pb-10" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 40px)" }}>
        <img src={t.logo} alt="APEX" className="w-auto mb-12" style={{ height: 16 }} />
        <p className={SOLO_TYPE.eyebrow} style={{ color: t.textMuted }}>
          You're set up
        </p>
        <h1 className={`mt-3 ${SOLO_TYPE.title}`}>
          {firstName ? `${firstName}, let's` : "Let's"} get your first session done today.
        </h1>
        <p className={`mt-3 ${SOLO_TYPE.body}`} style={{ color: t.textMuted }}>
          About 30 minutes, the whole body, with what you have. Learn the movements; go lighter than you think.
        </p>

        {session.exercises.length > 0 ? (
          <div className="mt-9 rounded-3xl px-5 pt-5 pb-3" style={soloGlass(t)}>
            <div className="flex items-baseline justify-between">
              <p className="text-[15px] font-medium">Your first session</p>
              <p className={`${SOLO_TYPE.meta} tabular-nums`} style={{ color: t.textMuted }}>
                {session.exercises.length} exercises · 3 sets
              </p>
            </div>
            <ul className="mt-3 border-t" style={{ borderColor: t.panelBorder }} data-testid="first-session-exercises">
              {session.exercises.map((m) => (
                <li key={m.exerciseId} className="flex items-center justify-between py-3 border-b last:border-b-0 text-[13px]" style={{ borderColor: t.panelBorder }}>
                  <span className="truncate">{exercisesById[m.exerciseId]?.name}</span>
                  <span className={`${SOLO_TYPE.meta} tabular-nums shrink-0 ml-3`} style={{ color: t.textMuted }}>
                    3 × {m.targetType === "time" ? `${m.targetReps}s` : m.targetReps}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <SoloButton t={t} className="mt-6" onClick={start} disabled={!session.exercises.length}>
          <Play size={12} fill="currentColor" /> Start your first session
        </SoloButton>

        {recommended && (
          <button
            type="button"
            onClick={() => navigate(`/solo/program/${recommended.id}`)}
            className="w-full flex items-center gap-3.5 mt-9 pt-5 border-t text-left"
            style={{ borderColor: t.panelBorder }}
          >
            <SoloArtwork program={recommended} t={t} className="w-11 h-11 rounded-xl shrink-0" />
            <span className="min-w-0 flex-1">
              <span className={`block ${SOLO_TYPE.eyebrow}`} style={{ color: t.textMuted }}>
                Recommended for you
              </span>
              <span className={`block ${SOLO_TYPE.row} truncate mt-1`}>{recommended.name}</span>
            </span>
            <ChevronRight size={15} strokeWidth={1.75} color={t.textFaint} className="shrink-0" />
          </button>
        )}

        <SoloTextButton t={t} className="mt-4" onClick={() => navigate("/solo/home", { replace: true })}>
          I'll start later
        </SoloTextButton>
      </div>
    </div>
  );
}
