import React from "react";
import { Logo } from "../components/ui";

// Train Solo's launch / loading screen (#165). One look from the moment the
// app opens until Train Solo's first real screen: the member's own page
// colour (white in light mode, near-black in dark) with the APEX mark —
// the same as the app's splash. It replaced a plain black screen that
// showed on every launch, even in light mode.
//
// Kept tiny and free of Train Solo's code so App.jsx can show it before
// that code has downloaded. `dark` defaults to the choice saved on the
// phone (SoloThemeContext's "soloThemeDark", dark when never set).
export function storedSoloDark() {
  try {
    const raw = localStorage.getItem("soloThemeDark");
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

export default function SoloLaunchScreen({ dark = storedSoloDark() }) {
  return (
    // data-apex-loading: the iPhone app knows this is a loading screen, not
    // a blank page (#161, #162).
    <div
      data-apex-loading=""
      data-testid="solo-launch-screen"
      className="w-full h-screen flex items-center justify-center"
      style={{ backgroundColor: dark ? "#0A0A0B" : "#FFFFFF" }}
    >
      <Logo variant="mark" tone={dark ? "white" : "black"} className="w-10 h-10 opacity-25 animate-pulse" />
    </div>
  );
}
