import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useSoloApp } from "../lib/SoloAppContext";
import { useSoloTheme, SOLO_THEMES, soloGlass } from "./SoloThemeContext";
import { visibleCategories, visiblePrograms, visibleRecoveryAddons, isRecoveryAddon, recommendForAnswers, formatAudPrice } from "./recommendations";
import { isFlaggedForMedicalReview } from "./onboarding/questionnaireConfig";
import { SoloArtwork } from "./SoloArtwork";
import { inIosApp, APP_STORE_URL } from "./appShell";
import { useSoloPaywall } from "./SoloPaywall";
import { inAppPurchasesAvailable, loadProgramPrices } from "../lib/purchases";
import { SoloPageHeader } from "./SoloUI";

// One empty object for "no answers yet", so memos that depend on the
// answers don't recompute on every render (#172).
const NO_ANSWERS = Object.freeze({});

// A card's price line. Recovery add-ons: Free, or Plus after launch. Catalogue
// programs (#186): "Included" for All Access members, "Owned" once bought
// (after launch), otherwise the program's own price — single programs are
// still sold after launch. Never a price inside the iOS app (3.1.1).
function priceLabel(program, { live = false, allAccess = false, owned = false, applePrices = null } = {}) {
  if (isRecoveryAddon(program)) return live ? "Plus" : "Free";
  if (live && allAccess && !owned) return "Included";
  if (live && owned) return "Owned";
  // In the iPhone app: Apple's own price, for a program with an App Store
  // product (#191); none otherwise — never the website's (3.1.1).
  if (inIosApp()) return owned ? null : applePrices?.[program.id] || null;
  return formatAudPrice(program.priceCents);
}

function ProgramCard({ program, t, onClick, live = false, allAccess = false, owned = false, applePrices = null }) {
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
          {priceLabel(program, { live, allAccess, owned, applePrices }) && <p className="text-sm font-extrabold whitespace-nowrap">{priceLabel(program, { live, allAccess, owned, applePrices })}</p>}
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
  const { soloProgramCategories, soloPrograms, soloProgramsLoaded, soloCurrentUser, soloPurchases, soloGatesLive, soloHasAllAccess, soloEnrolments } = useSoloApp();
  const { openPaywall } = useSoloPaywall();
  const live = soloGatesLive;
  const { dark, accent } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const [activeCategoryId, setActiveCategoryId] = useState(null);

  const categories = useMemo(() => visibleCategories(soloProgramCategories, soloPrograms), [soloProgramCategories, soloPrograms]);
  const published = useMemo(() => visiblePrograms(soloPrograms, soloProgramCategories), [soloPrograms, soloProgramCategories]);
  const recoveryAddons = useMemo(() => visibleRecoveryAddons(soloPrograms), [soloPrograms]);
  const activeAddonId = soloCurrentUser?.recoveryAddon?.programId;

  const answers = soloCurrentUser?.onboarding?.answers || NO_ANSWERS;
  // The two best fits for this customer's consultation answers, leaving
  // out anything they already own.
  // (and the All Access program they're already running)
  // Apple's prices for programs sold in the iPhone app (#191).
  const [applePrices, setApplePrices] = useState(null);
  const programIdsKey = (soloPrograms || []).filter((p) => !isRecoveryAddon(p)).map((p) => p.id).sort().join(",");
  useEffect(() => {
    if (!inIosApp() || !inAppPurchasesAvailable() || soloHasAllAccess || !programIdsKey) return;
    let alive = true;
    loadProgramPrices(programIdsKey.split(","))
      .then((list) => {
        if (alive) setApplePrices(Object.fromEntries((Array.isArray(list) ? list : []).map((x) => [x.programId, x.price])));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [programIdsKey, soloHasAllAccess]);
  // Programs bought on their own (#186): "Owned" on their cards.
  const boughtIds = useMemo(() => new Set((soloPurchases || []).map((p) => p.programId)), [soloPurchases]);
  const ownedIds = useMemo(
    () => [...(soloPurchases || []).map((p) => p.programId), ...(soloEnrolments || []).filter((e) => e.status === "active").map((e) => e.programId)],
    [soloPurchases, soloEnrolments]
  );
  const picks = useMemo(
    () => recommendForAnswers(soloPrograms, soloProgramCategories, answers, { limit: 1, excludeIds: ownedIds }),
    [soloPrograms, soloProgramCategories, answers, ownedIds]
  );
  const recommended = picks.programs;
  const flagged = isFlaggedForMedicalReview(answers);

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
      <SoloPageHeader t={t} title="Catalogue" />

      <div className="px-3 pt-1 pb-1">
        {/* Website only: how buying works. The iOS app shows no prices and
            never points to the website (guideline 3.1.1), so this never
            renders there. */}
        {live && !soloHasAllAccess && (
          <button type="button" onClick={() => openPaywall({ tier: "all_access" })} className="w-full text-left rounded-2xl px-4 py-3 mb-4" style={soloGlass(t)}>
            <p className="text-sm font-bold">Every program, one subscription</p>
            <p className="text-xs leading-relaxed mt-0.5" style={{ color: t.textMuted }}>
              All Access unlocks the whole catalogue and every new program as it's released.{" "}
              <span className="font-semibold underline" style={{ color: t.text }}>
                See plans
              </span>
            </p>
          </button>
        )}
        {!inIosApp() && (
          <div className="rounded-2xl px-4 py-3 mb-4" style={soloGlass(t)}>
            <p className="text-sm font-bold">{live ? "Buy a program or subscribe here" : "Buy your program here"}</p>
            <p className="text-xs leading-relaxed mt-0.5" style={{ color: t.textMuted }}>
              It unlocks instantly in the APEX app — log in with this same account to train.{" "}
              <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline" style={{ color: t.text }}>
                Get the app
              </a>
            </p>
          </div>
        )}

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
            <h2 className={`text-lg font-bold mt-1 ${picks.exact ? "mb-3" : ""}`}>{picks.exact ? "Recommended for you" : "Closest to your answers"}</h2>
            {!picks.exact && (
              <p className="text-xs mt-0.5 mb-3" style={{ color: t.textMuted }}>
                No program matches every answer yet — this is the nearest.
              </p>
            )}
            <div className="space-y-2.5">
              {recommended.map((p) => {
                const weeks = p.weekOnePreview?.totalWeeks || 0;
                return (
                  // The match, full width (#196): its artwork large, a blue
                  // glow, YOUR MATCH, the name in capitals.
                  <button
                    key={p.id}
                    onClick={() => openProgram(p.id)}
                    className="relative w-full block rounded-[26px] overflow-hidden text-left"
                    style={{ border: "1px solid rgba(47,143,255,0.6)", boxShadow: t.bg === "#FFFFFF" ? "0 10px 30px rgba(47,143,255,0.18)" : "0 0 36px rgba(47,143,255,0.32)" }}
                  >
                    <SoloArtwork program={p} t={t} logoClassName="h-9 w-auto" className="w-full aspect-[4/3]" />
                    <span aria-hidden="true" className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(5,5,6,0) 40%, rgba(5,5,6,0.88) 100%)" }} />
                    <span className="absolute left-4 top-4 px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-[0.12em] text-white" style={{ backgroundColor: "#2F8FFF" }}>
                      Your match
                    </span>
                    <span className="absolute left-4 right-4 bottom-4 flex items-end justify-between gap-3 text-white">
                      <span className="min-w-0">
                        <span className="block text-[24px] font-extrabold uppercase leading-[1.02]">{p.name}</span>
                        <span className="block text-[11px] font-bold uppercase tracking-[0.12em] mt-1.5 text-white/70">
                          {p.level}
                          {weeks > 0 ? ` · ${weeks} weeks` : ""}
                        </span>
                      </span>
                      {priceLabel(p, { live, allAccess: soloHasAllAccess, owned: boughtIds.has(p.id), applePrices }) && (
                        <span className="text-sm font-bold whitespace-nowrap">{priceLabel(p, { live, allAccess: soloHasAllAccess, owned: boughtIds.has(p.id), applePrices })}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          published.length > 0 && (
            <p className="text-xs mb-5" style={{ color: t.textFaint }}>
              {soloCurrentUser?.onboarding?.completed
                ? "No program matches every one of your consultation answers yet — browse every program below."
                : "Complete your consultation for personalised picks — browse every program below in the meantime."}
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
          // Still arriving (first open on this phone): nothing, rather than
          // "No programs" flashing before the catalogue shows (#157).
          soloProgramsLoaded === false ? null : (
            <p className="text-sm text-center py-16" style={{ color: t.textFaint }}>
              No programs are published yet — check back soon.
            </p>
          )
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
                <ProgramCard key={p.id} program={p} t={t} live={live} allAccess={soloHasAllAccess} owned={boughtIds.has(p.id)} applePrices={applePrices} onClick={() => openProgram(p.id)} />
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
              {live ? "With Plus · add one to your program" : "Free · add one to your program"}
            </p>
            <h2 className="text-lg font-bold mt-1 mb-3">Recovery add-ons</h2>
            {recoveryAddons.map((p) => (
              <div key={p.id} className="relative">
                <ProgramCard program={p} t={t} live={live} allAccess={soloHasAllAccess} owned={boughtIds.has(p.id)} applePrices={applePrices} onClick={() => openProgram(p.id)} />
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
