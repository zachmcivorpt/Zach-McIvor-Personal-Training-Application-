/* ============================================================================
   M PERSONAL TRAINING — MONOCHROME + MEASUREMENT-BLUE DESIGN TOKENS
   The product chrome (nav, buttons, cards, active states) stays pure black
   & white. One accent hue exists, reserved entirely for data: every chart,
   sparkline and measurement trend reads in the same crisp blue, so "this is
   a number changing over time" has one consistent visual signature app-wide.
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

// The one accent: a crisp, cool blue used exclusively for measurement data —
// weight, sleep, steps, heart rate, training charts. Never used on chrome.
export const MEASURE_BLUE = "#2F8FFF";
export const MEASURE_BLUE_SOFT = "rgba(47,143,255,0.16)";
export const MEASURE_BLUE_FAINT = "rgba(47,143,255,0.35)";
