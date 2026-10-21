import React from "react";

// A program's artwork — the coach-uploaded image when there is one,
// otherwise the theme's plain cover gradient with the APEX mark, same
// fallback the Catalogue's program cards use. `t` is the active
// SOLO_THEMES entry.
export function SoloArtwork({ program, t, logoClassName = "h-6 w-auto", className = "" }) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: t.coverGradient }}>
      {program?.artworkUrl ? (
        <img src={program.artworkUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <img src={t.logo} alt="" className={`${logoClassName} opacity-90`} />
        </div>
      )}
    </div>
  );
}
