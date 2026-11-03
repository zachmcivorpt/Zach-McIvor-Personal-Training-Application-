import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Play, ChevronRight } from "lucide-react";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES, soloGlass } from "./SoloThemeContext";
import { PrimaryButton } from "../components/ui";
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
      <div className="max-w-md mx-auto px-3 pb-10" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 40px)" }}>
        <img src={t.logo} alt="APEX" className="w-auto mb-10" style={{ height: 19 }} />
        <p className="text-[11px] font-semibold tracking-[0.16em] uppercase" style={{ color: t.textMuted }}>
          You're set up
        </p>
        <h1 className="mt-2 text-[34px] leading-[1.08] font-semibold tracking-[-0.03em]">
          {firstName ? `${firstName}, let's` : "Let's"} get your first session done today.
        </h1>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: t.textMuted }}>
          About 30 minutes, the whole body, with what you have. Learn the movements; go lighter than you think.
        </p>

        {session.exercises.length > 0 ? (
          <div className="mt-8 rounded-2xl px-4 pt-4 pb-3" style={soloGlass(t)}>
            <div className="flex items-baseline justify-between">
              <p className="text-lg font-bold">Your first session</p>
              <p className="text-xs tabular-nums" style={{ color: t.textMuted }}>
                {session.exercises.length} exercises · 3 sets
              </p>
            </div>
            <ul className="mt-3 border-t" style={{ borderColor: t.panelBorder }} data-testid="first-session-exercises">
              {session.exercises.map((m) => (
                <li key={m.exerciseId} className="flex items-center justify-between py-2.5 border-b last:border-b-0 text-sm" style={{ borderColor: t.panelBorder }}>
                  <span className="truncate">{exercisesById[m.exerciseId]?.name}</span>
                  <span className="text-xs tabular-nums shrink-0 ml-3" style={{ color: t.textMuted }}>
                    3 × {m.targetType === "time" ? `${m.targetReps}s` : m.targetReps}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <PrimaryButton dark={dark} className="w-full mt-6 rounded-full" onClick={start} disabled={!session.exercises.length}>
          <Play size={15} fill="currentColor" /> START YOUR FIRST SESSION
        </PrimaryButton>

        {recommended && (
          <button
            type="button"
            onClick={() => navigate(`/solo/program/${recommended.id}`)}
            className="w-full flex items-center gap-3.5 mt-8 pt-5 border-t text-left"
            style={{ borderColor: t.panelBorder }}
          >
            <SoloArtwork program={recommended} t={t} className="w-12 h-12 rounded-xl shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold tracking-[0.12em] uppercase" style={{ color: t.textMuted }}>
                Recommended for you
              </span>
              <span className="block text-sm font-semibold truncate mt-0.5">{recommended.name}</span>
            </span>
            <ChevronRight size={16} color={t.textFaint} className="shrink-0" />
          </button>
        )}

        <button type="button" onClick={() => navigate("/solo/home", { replace: true })} className="w-full text-sm font-semibold py-4 mt-4" style={{ color: t.textMuted }}>
          I'll start later
        </button>
      </div>
    </div>
  );
}
