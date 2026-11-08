import React, { Suspense, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutGrid, CalendarDays, LineChart, CircleUserRound, Dumbbell } from "lucide-react";
import { useSoloTheme, SOLO_THEMES, soloGlassVars } from "./SoloThemeContext";
import SoloCatalogueScreen from "./SoloCatalogueScreen";
import SoloMyTrainingScreen from "./SoloMyTrainingScreen";
import SoloProfileScreen from "./SoloProfileScreen";
import SoloCalendarScreen from "./SoloCalendarScreen";
import { useSoloApp } from "../lib/SoloAppContext";
import { soloDb } from "../lib/firebase";
import { useAppleHealthSync } from "../lib/appleHealth";
import { canUse } from "./soloAccess";
import { SoloProgressScreen, preloadSoloScreens } from "./soloScreens";

// Order set by the owner (#171): My Training, Progress, Calendar,
// Catalogue, Profile.
const TABS = [
  { id: "training", label: "My Training", icon: Dumbbell },
  { id: "progress", label: "Progress", icon: LineChart },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "catalogue", label: "Catalogue", icon: LayoutGrid },
  { id: "profile", label: "Profile", icon: CircleUserRound },
];

// The signed-in customer's home — a persistent bottom nav over four
// tabs, matching the approved design canvas's Main/Purchased/Profile
// bottom nav exactly (Progress added alongside it). No notification
// badge/bell or in-app centre — Train Solo's only notification is the
// Monday check-in push (see SoloProfileScreen's reminders toggle).
//
// Initial tab can be requested via navigate(path, { state: { soloTab } })
// from elsewhere in Train Solo (e.g. after a purchase completes) so the
// customer lands where the flow left off instead of always on My Training
// (the first tab and the default).
// The tab bar's height (10px padding + icon, label and gaps + 10px + the
// home-indicator inset), reserved under the page content.
const NAV_SPACE = "calc(64px + env(safe-area-inset-bottom,0px))";

export default function SoloShell() {
  const location = useLocation();
  const navigate = useNavigate();
  // Also `?soloTab=` — what Stripe's billing portal returns to
  // (/solo/home?soloTab=profile), which used to land on My Training (#157).
  const requestedTab = location.state?.soloTab || new URLSearchParams(location.search).get("soloTab");
  const initialTab = TABS.some((t) => t.id === requestedTab) ? requestedTab : "training";
  const [tab, setTab] = useState(initialTab);

  // navigate(path, { state }) to a route already mounted as SoloShell (e.g.
  // the post-purchase redirect landing back on "/solo/home") does not
  // remount this component, so the useState initializer above won't re-run.
  // Re-apply the requested tab whenever fresh nav state arrives.
  useEffect(() => {
    if (location.state?.soloTab && TABS.some((t) => t.id === location.state.soloTab)) {
      setTab(location.state.soloTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const { dark } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];

  // Home is on screen: fetch the other screens' code now, so opening a
  // program, a workout or Progress never waits for it (#165).
  useEffect(() => {
    const id = setTimeout(preloadSoloScreens, 300);
    return () => clearTimeout(id);
  }, []);

  // Apple Health (iPhone app only, connected from Profile).
  // A Plus feature once subscriptions launch (soloAccess.js).
  const { soloCurrentUser, soloAccess } = useSoloApp();
  useAppleHealthSync(
    "solo",
    { db: soloDb, metrics: "soloBodyMetrics", weighIns: "soloWeighIns", owner: "soloUserId", uid: soloCurrentUser?.id },
    canUse("appleHealthProgress", soloAccess)
  );

  return (
    <div className="min-h-dvh w-full flex flex-col" style={{ backgroundColor: t.bg, color: t.text, transition: "background-color 0.2s,color 0.2s" }}>
      {/* No overflow here: the window is what scrolls. A non-scrolling
          overflow-y-auto column made iOS treat taps on its content as
          possible scroll gestures, so buttons/links responded unreliably. */}
      <div className="flex-1 solo-glass-scope" style={{ ...soloGlassVars(t), paddingBottom: NAV_SPACE }}>
        {tab === "catalogue" && <SoloCatalogueScreen />}
        {tab === "training" && <SoloMyTrainingScreen />}
        {tab === "progress" && (
          <Suspense fallback={null}>
            <SoloProgressScreen />
          </Suspense>
        )}
        {tab === "calendar" && <SoloCalendarScreen />}
        {tab === "profile" && <SoloProfileScreen />}
      </div>

      {/* Pinned to the bottom of the screen at all times (the window
          scrolls, not this column). Fixed rather than sticky: on iOS a
          sticky, blurred bar could come loose and float up the screen
          during a momentum scroll. The content above reserves NAV_SPACE so
          nothing sits hidden behind it. */}
      {/* Docked to the very bottom, edge to edge (#197: floating 14px up,
          the page showed underneath it). Glass, uppercase labels, the open
          tab bright with a glowing blue dot (#196). */}
      <nav
        aria-label="Train Solo"
        className="fixed left-0 right-0 bottom-0 z-40 grid grid-cols-5 items-start backdrop-blur-xl"
        style={{
          height: "calc(64px + env(safe-area-inset-bottom,0px))",
          paddingBottom: "env(safe-area-inset-bottom,0px)",
          borderTop: `1px solid ${t.navBorder}`,
          backgroundColor: t.navBg,
        }}
      >
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                setTab(item.id);
                // Remembered on this history entry, so coming back from a
                // program page (browser/app back) reopens the same tab
                // rather than the default.
                navigate(location.pathname, { replace: true, state: { soloTab: item.id } });
              }}
              className="h-16 flex flex-col items-center justify-center gap-1"
            >
              <Icon size={19} color={active ? t.text : t.textFaint} strokeWidth={active ? 2.2 : 1.8} style={active && dark ? { filter: "drop-shadow(0 0 6px rgba(255,255,255,0.7))" } : undefined} />
              <span className="text-[8.5px] font-bold uppercase tracking-[0.1em] leading-none" style={{ color: active ? t.text : t.textFaint }}>
                {item.label}
              </span>
              <span className="w-1 h-1 rounded-full" style={{ background: active ? "#2F8FFF" : "transparent", boxShadow: active ? "0 0 8px #2F8FFF" : "none" }} />
            </button>
          );
        })}
      </nav>
    </div>
  );
}
