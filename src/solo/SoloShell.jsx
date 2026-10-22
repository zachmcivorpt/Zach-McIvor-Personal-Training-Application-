import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutGrid, CalendarDays, LineChart, CircleUserRound } from "lucide-react";
import { useSoloTheme, SOLO_THEMES, soloGlassVars } from "./SoloThemeContext";
import SoloCatalogueScreen from "./SoloCatalogueScreen";
import SoloMyTrainingScreen from "./SoloMyTrainingScreen";
import SoloProgressScreen from "./SoloProgressScreen";
import SoloProfileScreen from "./SoloProfileScreen";

const TABS = [
  { id: "training", label: "My Training", icon: CalendarDays },
  { id: "catalogue", label: "Catalogue", icon: LayoutGrid },
  { id: "progress", label: "Progress", icon: LineChart },
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
export default function SoloShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialTab = TABS.some((t) => t.id === location.state?.soloTab) ? location.state.soloTab : "training";
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

  return (
    <div className="min-h-dvh w-full flex flex-col" style={{ backgroundColor: t.bg, color: t.text, transition: "background-color 0.2s,color 0.2s" }}>
      {/* No overflow here: the window is what scrolls. A non-scrolling
          overflow-y-auto column made iOS treat taps on its content as
          possible scroll gestures, so buttons/links responded unreliably. */}
      <div className="flex-1 solo-glass-scope" style={soloGlassVars(t)}>
        {tab === "catalogue" && <SoloCatalogueScreen />}
        {tab === "training" && <SoloMyTrainingScreen />}
        {tab === "progress" && <SoloProgressScreen />}
        {tab === "profile" && <SoloProfileScreen />}
      </div>

      {/* Pinned to the bottom of the screen at all times — the page itself
          scrolls (the window, not this column), so without sticky the bar
          only appeared once you scrolled to the very end of a long tab. */}
      <div
        className="sticky bottom-0 z-40 flex shrink-0 backdrop-blur-xl"
        style={{
          borderTop: `1px solid ${t.navBorder}`,
          backgroundColor: t.navBg,
          paddingBottom: "calc(10px + env(safe-area-inset-bottom,0px))",
          paddingTop: 10,
        }}
      >
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setTab(item.id);
                // Remembered on this history entry, so coming back from a
                // program page (browser/app back) reopens the same tab
                // rather than the default.
                navigate(location.pathname, { replace: true, state: { soloTab: item.id } });
              }}
              className="flex-1 flex flex-col items-center gap-1 py-1"
            >
              <Icon size={20} color={active ? t.text : t.textFaint} strokeWidth={active ? 2.3 : 2} />
              <span className="text-[10px] font-semibold" style={{ color: active ? t.text : t.textFaint }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
