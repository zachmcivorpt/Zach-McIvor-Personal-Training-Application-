/* ============================================================================
   M PERSONAL TRAINING — MONOCHROME + MEASUREMENT-BLUE DESIGN TOKENS
   The product chrome (nav, buttons, cards, active states) stays pure black
   & white. One accent hue exists, reserved entirely for data: every chart,
   sparkline and measurement trend reads in the same crisp blue, so "this is
   a number changing over time" has one consistent visual signature app-wide.
============================================================================ */

// Everything past login is light: white page, near-black text. Only the
// Login/Activate screens stay on the old dark palette (hardcoded directly
// in those two files, not sourced from here).
export const BG = "#FFFFFF"; // app background, white
export const SURFACE = "#F7F7F8"; // card background
export const SURFACE_RAISED = "#FFFFFF"; // sheets, modals, nested surfaces (white + border/shadow)
export const BORDER = "rgba(10,10,11,0.08)";
export const BORDER_STRONG = "rgba(10,10,11,0.16)";

export const TEXT = "#0A0A0B"; // primary text on light
export const TEXT_MUTED = "#6B6B70"; // secondary text on light
export const TEXT_FAINT = "#AFAFB4"; // tertiary / disabled

export const INK = "#0A0A0B"; // text on light/white surfaces
export const PAPER = "#FFFFFF"; // white surface (print-like areas)

// The single accent: near-black, used sparingly for primary actions,
// active states, and progress fills.
export const ACCENT = "#0A0A0B";
export const ACCENT_INK = "#FFFFFF"; // text/icon color when sitting on ACCENT

// Semantic states are expressed via opacity/weight of the same neutral,
// not hue — keeps the whole product strictly black & white.
export const STATE_SUCCESS = "#0A0A0B";
export const STATE_MUTED = "rgba(10,10,11,0.3)";

// The one accent: a crisp, cool blue. In the client app it's used exclusively
// for measurement data (weight, sleep, steps, heart rate, training charts),
// never on chrome. The coach console is the deliberate exception: blue is
// also used there as a UI accent (active/interactive elements, badges,
// library icons) per an explicit "make it more colourful, blue + black
// outlines" request — chrome there still defaults to black, blue marks what's
// interactive or "yours" (custom library items) vs. static/built-in.
export const MEASURE_BLUE = "#2F8FFF";
export const MEASURE_BLUE_SOFT = "rgba(47,143,255,0.16)";
export const MEASURE_BLUE_FAINT = "rgba(47,143,255,0.35)";
