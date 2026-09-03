/* ============================================================================
   M PERSONAL TRAINING — MONOCHROME DESIGN TOKENS
   Pure black & white, premium/editorial. No brand hue anywhere — hierarchy
   comes from weight, opacity and scale, not color. The only "accent" is
   white-on-black (primary actions) or black-on-white (inverse contexts).
============================================================================ */

export const BG = "#0A0A0B"; // app background, near-black
export const SURFACE = "#141416"; // card background
export const SURFACE_RAISED = "#1C1C1F"; // sheets, modals, nested surfaces
export const BORDER = "rgba(255,255,255,0.08)";
export const BORDER_STRONG = "rgba(255,255,255,0.16)";

export const TEXT = "#F5F5F4"; // primary text on dark
export const TEXT_MUTED = "#8B8B8F"; // secondary text on dark
export const TEXT_FAINT = "#5C5C60"; // tertiary / disabled

export const INK = "#0A0A0B"; // text on light/white surfaces
export const PAPER = "#FFFFFF"; // white surface (login, print-like areas)

// The single accent: pure white, used sparingly for primary actions,
// active states, and progress fills.
export const ACCENT = "#FFFFFF";
export const ACCENT_INK = "#0A0A0B"; // text/icon color when sitting on ACCENT

// Semantic states are expressed via opacity/weight of the same neutral,
// not hue — keeps the whole product strictly black & white.
export const STATE_SUCCESS = "#FFFFFF";
export const STATE_MUTED = "rgba(255,255,255,0.3)";
