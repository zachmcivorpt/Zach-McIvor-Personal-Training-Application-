import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { SheetSurfaceContext } from "../components/ui";
import { MARK_BLACK, MARK_WHITE } from "../lib/brand";
import { useSoloApp } from "../lib/SoloAppContext";

// The one coach-configurable Train Solo branding setting (see
// firestore.rules' settings/soloBranding and CoachTrainSolo.jsx's
// Branding tab) — never the logo, which stays the real APEX mark always.
// No amber/yellow option — CLAUDE.md's visual-design rules ban it
// anywhere in the UI, with no carve-out for per-coach branding choices.
export const SOLO_ACCENT_PALETTE = { blue: "#2F8FFF", slate: "#64748B", teal: "#2FA89A" };

// Train Solo's own light/dark toggle — independent of Coaching's
// ClientThemeContext (src/client/ClientApp.jsx), since a Train Solo
// customer never shares a React tree, a session, or a theme preference
// with a Coaching client. Persisted per-device in localStorage for now;
// Phase 3 ("Solo profile ... theme preferences") is where this becomes a
// synced soloUsers/{uid} field, same as everything else that phase moves
// from device-local to account-level.
const STORAGE_KEY = "soloThemeDark";
const SoloThemeCtx = createContext({ dark: true, accent: "#2F8FFF", toggleSoloTheme: () => {} });

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

const FULL_BLEED_PATHS = ["/solo/login", "/solo/register", "/solo/onboarding"];

export function SoloThemeProvider({ children }) {
  const [dark, setDark] = useState(readStored);
  const { soloBranding, soloProfileMissing } = useSoloApp();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(dark));
    } catch {
      // best-effort only — a blocked/unavailable localStorage just means
      // the choice doesn't persist across visits, nothing else breaks.
    }
  }, [dark]);

  // The strip at the very top of the phone follows Solo's own light/dark
  // toggle: the App Store build's native status-bar background (see
  // NativeStatusBarSync in App.jsx, which skips /solo routes for this) and
  // the browser's theme-color. Re-posted on every Solo route change since
  // NativeStatusBarSync no longer does it here.
  //
  // The full-bleed photo screens (login, register, the questionnaire and
  // the finish-setup screen) instead run the photo all the way up behind
  // the status bar — the same edge-to-edge frame Coaching's /login uses —
  // with light status-bar icons; their content is padded clear of it by
  // SoloBackgroundFrame. A build without edge-to-edge support still gets a
  // dark strip there rather than a white one.
  const { pathname } = useLocation();
  const fullBleed = FULL_BLEED_PATHS.includes(pathname) || !!soloProfileMissing;
  // Declared first so it captures index.html's value before the effect
  // below overwrites it, and puts it back when leaving Train Solo.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const original = meta?.getAttribute("content");
    return () => {
      if (meta && original != null) meta.setAttribute("content", original);
    };
  }, []);
  useEffect(() => {
    try {
      window.webkit?.messageHandlers?.apexTheme?.postMessage({ dark: dark || fullBleed, edgeToEdge: fullBleed });
    } catch {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", fullBleed ? "#0A0A0B" : SOLO_THEMES[dark ? "dark" : "light"].bg);
  }, [dark, pathname, fullBleed]);

  const accent = SOLO_ACCENT_PALETTE[soloBranding?.accent] || SOLO_ACCENT_PALETTE.blue;
  const value = useMemo(
    () => ({ dark, accent, toggleSoloTheme: () => setDark((d) => !d), setSoloThemeDark: setDark }),
    [dark, accent]
  );
  // Every BottomSheet opened anywhere in Train Solo (its own sheets and the
  // shared ones it reuses — Add Exercise, Log Weight, Delete account) gets
  // the frosted-glass fill instead of a solid one.
  const sheetSurface = useMemo(() => soloSheetGlass(SOLO_THEMES[dark ? "dark" : "light"]), [dark]);
  return (
    <SoloThemeCtx.Provider value={value}>
      <SheetSurfaceContext.Provider value={sheetSurface}>{children}</SheetSurfaceContext.Provider>
    </SoloThemeCtx.Provider>
  );
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
    glassBg: "rgba(28,28,30,0.55)",
    sheetGlassBg: "rgba(24,24,26,0.78)",
    insetBg: "rgba(255,255,255,0.045)",
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
    glassBg: "rgba(255,255,255,0.62)",
    sheetGlassBg: "rgba(247,246,243,0.92)",
    insetBg: "rgba(20,19,15,0.035)",
  },
};

// Train Solo's one card style: translucent glass over the page background.
// Every Solo box uses this rather than a solid fill (see CLAUDE.md's Train
// Solo design rule). `t` is the active SOLO_THEMES entry.
export function soloGlass(t) {
  return {
    backgroundColor: t.glassBg,
    border: `1px solid ${t.panelBorder}`,
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
  };
}

// CSS variables for index.css's .solo-glass-scope rule, which applies the
// same glass to the shared Card-based widgets Train Solo reuses.
export function soloGlassVars(t) {
  return { "--solo-glass-bg": t.glassBg, "--solo-glass-border": t.panelBorder };
}

// Glass for Train Solo's bottom sheets (BottomSheet's `surface` prop) —
// a denser fill than soloGlass so text stays readable over the dimmed page.
export function soloSheetGlass(t) {
  return {
    backgroundColor: t.sheetGlassBg,
    backdropFilter: "blur(28px)",
    WebkitBackdropFilter: "blur(28px)",
  };
}
