import React from "react";

// A Train Solo glass card that CONTAINS tappable rows/buttons.
//
// The frosted fill (backdrop-filter) is painted on its own absolutely
// positioned layer behind the content, with pointer-events off — not on the
// container itself. On iOS WebKit, a backdrop-filter container that clips
// its children (overflow-hidden + rounded corners) gets its own compositing
// layer, and taps on the links/buttons inside it were landing unreliably or
// not at all (Profile's My Calendar / reminders rows). Keeping the effect
// on a separate non-interactive layer leaves the content's hit-testing
// completely ordinary. Cards that ARE the tappable element (a single
// button) still use soloGlass(t) directly.
export default function SoloGlassBox({ t, className = "", children }) {
  return (
    <div className={`relative isolate ${className}`} style={{ border: `1px solid ${t.panelBorder}` }}>
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 pointer-events-none"
        style={{
          borderRadius: "inherit",
          backgroundColor: t.glassBg,
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
        }}
      />
      {children}
    </div>
  );
}
