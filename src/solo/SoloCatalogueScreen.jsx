import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES, soloGlass } from "./SoloThemeContext";
import { visibleCategories, visiblePrograms, visibleRecoveryAddons, isRecoveryAddon, recommendPrograms, formatAudPrice } from "./recommendations";
import { isFlaggedForMedicalReview } from "./onboarding/questionnaireConfig";
import { SoloArtwork } from "./SoloArtwork";
import { inIosApp } from "./appShell";

function ProgramCard({ program, t, onClick }) {
  return (
    <button
      onClick={onClick}
      className="block w-full text-left rounded-[22px] overflow-hidden mb-3.5"
      style={soloGlass(t)}
    >
      <div className="h-[120px] flex items-center justify-center relative overflow-hidden" style={{ background: t.coverGradient }}>
        {program.artworkUrl ? (
          <img src={program.artworkUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <img src={t.logo} alt="" className="h-14 w-auto opacity-90" />
        )}
      </div>
      <div className="px-4 py-3.5">
        <div className="flex items-start justify-between gap-2.5">
          <p className="text-[15px] font-bold leading-tight">{program.name}</p>
          {/* No price for paid programs inside the iOS app — see appShell.js. */}
          {isRecoveryAddon(program) ? (
            <p className="text-sm font-extrabold whitespace-nowrap">Free</p>
          ) : (
            !inIosApp() && <p className="text-sm font-extrabold whitespace-nowrap">{formatAudPrice(program.priceCents)}</p>
          )}
        </div>
        {program.description && (
          <p className="text-xs mt-1 line-clamp-2" style={{ color: t.textMuted }}>
            {program.description}
          </p>
        )}
        <div className="flex gap-1.5 mt-2.5">
          <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: t.chipBg, color: t.textMuted }}>
            {program.level}
          </span>
        </div>
      </div>
    </button>
  );
}

export default function SoloCatalogueScreen() {
  const navigate = useNavigate();
  const { soloProgramCategories, soloPrograms, soloCurrentUser, soloPurchases } = useSoloApp();
  const { dark, accent } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const [activeCategoryId, setActiveCategoryId] = useState(null);

  const categories = useMemo(() => visibleCategories(soloProgramCategories, soloPrograms), [soloProgramCategories, soloPrograms]);
  const published = useMemo(() => visiblePrograms(soloPrograms, soloProgramCategories), [soloPrograms, soloProgramCategories]);
  const recoveryAddons = useMemo(() => visibleRecoveryAddons(soloPrograms), [soloPrograms]);
  const activeAddonId = soloCurrentUser?.recoveryAddon?.programId;

  const answers = soloCurrentUser?.onboarding?.answers || {};
  // The two best fits for this customer's consultation answers, leaving
  // out anything they already own.
  const ownedIds = useMemo(() => (soloPurchases || []).map((p) => p.programId), [soloPurchases]);
  const recommended = useMemo(
    () => recommendPrograms(soloPrograms, soloProgramCategories, answers, { limit: 2, excludeIds: ownedIds }),
    [soloPrograms, soloProgramCategories, answers, ownedIds]
  );
  const flagged = isFlaggedForMedicalReview(answers);
  const firstName = (soloCurrentUser?.name || "").trim().split(/\s+/)[0];

  const groups = categories
    .filter((c) => !activeCategoryId || c.id === activeCategoryId)
    .map((c) => ({
      category: c,
      programs: published.filter((p) => (p.categoryIds || []).includes(c.id)),
    }))
    .filter((g) => g.programs.length > 0);

  function openProgram(id) {
    navigate(`/solo/program/${id}`);
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex items-center justify-between gap-3 px-3 pt-5 pb-2">
        <img src={t.logo} alt="" style={{ height: 19 }} />
      </div>

      <div className="px-3 pt-3 pb-0">
        <h1 className="text-xl font-bold leading-tight">
          {firstName ? `Welcome, ${firstName}` : "Welcome"}
        </h1>
      </div>

      <div className="px-3 pt-2 pb-1">
        {flagged && (
          <div
            className="rounded-2xl px-4 py-3 mb-4 flex gap-2.5"
            style={soloGlass(t)}
          >
            <AlertTriangle size={16} color={accent} className="shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed" style={{ color: t.textMuted }}>
              Based on your consultation answers, it's worth checking in with a doctor or allied health professional before starting a
              new program. This isn't a diagnosis or medical clearance — just a standard first-pass safety flag.
            </p>
          </div>
        )}

        {recommended.length > 0 ? (
          <section className="mb-7">
            <p className="text-[11px] font-bold tracking-[0.12em] uppercase" style={{ color: accent }}>
              From your consultation
            </p>
            <h2 className="text-lg font-bold mt-1 mb-3">Recommended for you</h2>
            <div className="space-y-2.5">
              {recommended.map((p) => {
                const weeks = p.weekOnePreview?.totalWeeks || 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => openProgram(p.id)}
                    className="w-full flex items-center gap-3.5 rounded-2xl p-2.5 pr-4 text-left"
                    style={soloGlass(t)}
                  >
                    <SoloArtwork program={p} t={t} className="w-16 h-16 rounded-xl shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug">{p.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
                        {p.level}
                        {weeks > 0 ? ` · ${weeks} weeks` : ""}
                      </p>
                    </div>
                    {!inIosApp() && <p className="text-sm font-bold whitespace-nowrap">{formatAudPrice(p.priceCents)}</p>}
                    <ChevronRight size={16} color={t.textFaint} className="shrink-0 -ml-1" />
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          published.length > 0 && (
            <p className="text-xs mb-5" style={{ color: t.textFaint }}>
              Complete your consultation for personalised picks — browse every program below in the meantime.
            </p>
          )
        )}

        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-5 -mx-3 px-3">
          <button
            onClick={() => setActiveCategoryId(null)}
            className="shrink-0 text-[12.5px] font-bold px-3.5 py-2 rounded-full"
            style={activeCategoryId === null ? { backgroundColor: t.text, color: t.bg } : { backgroundColor: t.chipBg, color: t.textMuted, border: `1px solid ${t.panelBorder}` }}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCategoryId(c.id)}
              className="shrink-0 text-[12.5px] font-semibold px-3.5 py-2 rounded-full"
              style={
                activeCategoryId === c.id
                  ? { backgroundColor: t.text, color: t.bg }
                  : { backgroundColor: t.chipBg, color: t.textMuted, border: `1px solid ${t.panelBorder}` }
              }
            >
              {c.name}
            </button>
          ))}
        </div>

        {published.length === 0 ? (
          <p className="text-sm text-center py-16" style={{ color: t.textFaint }}>
            No programs are published yet — check back soon.
          </p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-center py-16" style={{ color: t.textFaint }}>
            No programs in this category yet.
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.category.id} className="mb-7">
              <p className="text-[11px] font-bold tracking-wide uppercase mb-3" style={{ color: t.textFaint }}>
                {g.category.name}
              </p>
              {g.programs.map((p) => (
                <ProgramCard key={p.id} program={p} t={t} onClick={() => openProgram(p.id)} />
              ))}
            </div>
          ))
        )}

        {/* Free recovery/mobility add-ons — one can run alongside a
            purchased program, filling its rest days on the calendar. Not
            category-filtered, so it shows under every category chip. */}
        {recoveryAddons.length > 0 && (
          <section className="mb-7">
            <p className="text-[11px] font-bold tracking-[0.12em] uppercase" style={{ color: accent }}>
              Free · add one to your program
            </p>
            <h2 className="text-lg font-bold mt-1 mb-3">Recovery add-ons</h2>
            {recoveryAddons.map((p) => (
              <div key={p.id} className="relative">
                <ProgramCard program={p} t={t} onClick={() => openProgram(p.id)} />
                {activeAddonId === p.id && (
                  <span className="absolute top-3 right-3 text-[10.5px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: accent, color: "#fff" }}>
                    Active
                  </span>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
