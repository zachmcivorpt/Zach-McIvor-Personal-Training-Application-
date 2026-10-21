import React from "react";

// Dark mountain artwork used behind Train Solo's My Training header and
// Program Detail hero (IMG_2148 reference). Drawn as SVG rather than a
// bundled photo so it stays crisp at any size and costs nothing to load.
// A program's own artworkUrl, when the coach has set one, always takes
// precedence over this — see SoloArtwork below.
export function SoloMountainArt({ className = "", fadeTo = "#0A0A0B" }) {
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <defs>
          <linearGradient id="soloSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1C1C1E" />
            <stop offset="100%" stopColor="#0A0A0B" />
          </linearGradient>
          <linearGradient id="soloPeakLit" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5A5A5E" />
            <stop offset="55%" stopColor="#2A2A2D" />
            <stop offset="100%" stopColor="#141415" />
          </linearGradient>
          <linearGradient id="soloPeakBack" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2E2E31" />
            <stop offset="100%" stopColor="#141415" />
          </linearGradient>
        </defs>
        <rect width="400" height="300" fill="url(#soloSky)" />
        {/* distant ridge */}
        <path d="M0 210 L60 160 L105 185 L160 120 L205 165 L250 135 L300 175 L345 140 L400 170 L400 300 L0 300 Z" fill="url(#soloPeakBack)" opacity="0.7" />
        {/* main peak */}
        <path d="M150 300 L215 150 L245 95 L262 70 L280 98 L300 120 L320 112 L345 150 L372 175 L400 190 L400 300 Z" fill="url(#soloPeakLit)" />
        {/* light-catching faces */}
        <path d="M262 70 L250 112 L232 150 L246 142 L258 118 L268 104 Z" fill="#8A8A8F" opacity="0.35" />
        <path d="M300 120 L292 150 L312 138 L320 112 Z" fill="#8A8A8F" opacity="0.22" />
        <path d="M262 70 L280 98 L274 120 L266 96 Z" fill="#B5B5BA" opacity="0.18" />
        {/* foreground ridge */}
        <path d="M0 240 L70 205 L120 225 L190 195 L250 230 L320 215 L400 240 L400 300 L0 300 Z" fill="#101011" opacity="0.9" />
      </svg>
      <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, rgba(10,10,11,0) 35%, ${fadeTo} 100%)` }} />
    </div>
  );
}

// A program's artwork — the coach-uploaded image when there is one,
// otherwise the mountain art with the APEX mark on top.
export function SoloArtwork({ program, logo, logoClassName = "h-6 w-auto", className = "" }) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {program?.artworkUrl ? (
        <img src={program.artworkUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <>
          <SoloMountainArt fadeTo="rgba(10,10,11,0.55)" />
          {logo && (
            <div className="absolute inset-0 flex items-center justify-center">
              <img src={logo} alt="" className={`${logoClassName} opacity-90`} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
