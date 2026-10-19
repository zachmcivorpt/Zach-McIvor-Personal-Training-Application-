import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { MARK_BLACK, MARK_WHITE } from "../lib/brand";

// Train Solo's own light/dark toggle — independent of Coaching's
// ClientThemeContext (src/client/ClientApp.jsx), since a Train Solo
// customer never shares a React tree, a session, or a theme preference
// with a Coaching client. Persisted per-device in localStorage for now;
// Phase 3 ("Solo profile ... theme preferences") is where this becomes a
// synced soloUsers/{uid} field, same as everything else that phase moves
// from device-local to account-level.
const STORAGE_KEY = "soloThemeDark";
const SoloThemeCtx = createContext({ dark: true, toggleSoloTheme: () => {} });

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

export function SoloThemeProvider({ children }) {
  const [dark, setDark] = useState(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(dark));
    } catch {
      // best-effort only — a blocked/unavailable localStorage just means
      // the choice doesn't persist across visits, nothing else breaks.
    }
  }, [dark]);

  const value = useMemo(() => ({ dark, toggleSoloTheme: () => setDark((d) => !d), setSoloThemeDark: setDark }), [dark]);
  return <SoloThemeCtx.Provider value={value}>{children}</SoloThemeCtx.Provider>;
}

export function useSoloTheme() {
  return useContext(SoloThemeCtx);
}

// Token set mirrors ThemeSystem.dc.html's already-approved dark/light
// pair exactly (same hex values) — the design canvas's THEMES constant is
// the source of truth this reproduces, not a new palette invented here.
export const SOLO_THEMES = {
  dark: {
    bg: "#0A0A0B",
    text: "#FFFFFF",
    textMuted: "rgba(255,255,255,0.55)",
    textFaint: "rgba(255,255,255,0.35)",
    panelBorder: "rgba(255,255,255,0.1)",
    cardBg: "rgba(255,255,255,0.05)",
    chipBg: "rgba(255,255,255,0.07)",
    navBg: "rgba(10,10,10,0.82)",
    navBorder: "rgba(255,255,255,0.08)",
    coverGradient: "radial-gradient(120% 100% at 50% 0%, #232323 0%, #0E0E0F 100%)",
    cardShadow: "0 10px 30px -14px rgba(0,0,0,0.6)",
    logo: MARK_WHITE,
    inputBg: "rgba(255,255,255,0.08)",
    inputBorder: "rgba(255,255,255,0.1)",
  },
  light: {
    bg: "#F5F4F1",
    text: "#14130F",
    textMuted: "rgba(20,19,15,0.55)",
    textFaint: "rgba(20,19,15,0.35)",
    panelBorder: "rgba(20,19,15,0.08)",
    cardBg: "rgba(255,255,255,0.62)",
    chipBg: "rgba(255,255,255,0.55)",
    navBg: "rgba(255,255,255,0.78)",
    navBorder: "rgba(20,19,15,0.07)",
    coverGradient: "radial-gradient(120% 100% at 50% 0%, #FFFFFF 0%, #EAE8E2 100%)",
    cardShadow: "0 10px 26px -16px rgba(20,19,15,0.18)",
    logo: MARK_BLACK,
    inputBg: "rgba(20,19,15,0.05)",
    inputBorder: "rgba(20,19,15,0.08)",
  },
};
