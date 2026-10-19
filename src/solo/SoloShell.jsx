import React, { useState } from "react";
import { LayoutGrid, CalendarDays, CircleUserRound } from "lucide-react";
import { useSoloTheme, SOLO_THEMES } from "./SoloThemeContext";
import SoloCatalogueScreen from "./SoloCatalogueScreen";
import SoloMyTrainingScreen from "./SoloMyTrainingScreen";
import SoloProfileScreen from "./SoloProfileScreen";

const TABS = [
  { id: "catalogue", label: "Catalogue", icon: LayoutGrid },
  { id: "training", label: "My Training", icon: CalendarDays },
  { id: "profile", label: "Profile", icon: CircleUserRound },
];

// The signed-in customer's home — a persistent bottom nav over three
// tabs, matching the approved design canvas's Main/Purchased/Profile
// bottom nav exactly. Deliberately no notification badge/bell anywhere
// here or on any tab inside it — Train Solo has no notifications at all
// (push, in-app centre, or otherwise); see SoloProfileScreen for where
// that was explicitly confirmed to have nothing to remove.
export default function SoloShell() {
  const [tab, setTab] = useState("catalogue");
  const { dark } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];

  return (
    <div className="min-h-dvh w-full flex flex-col" style={{ backgroundColor: t.bg, color: t.text, transition: "background-color 0.2s,color 0.2s" }}>
      <div className="flex-1 overflow-y-auto">
        {tab === "catalogue" && <SoloCatalogueScreen />}
        {tab === "training" && <SoloMyTrainingScreen />}
        {tab === "profile" && <SoloProfileScreen />}
      </div>

      <div
        className="flex shrink-0 backdrop-blur-xl"
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
            <button key={item.id} onClick={() => setTab(item.id)} className="flex-1 flex flex-col items-center gap-1 py-1">
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
