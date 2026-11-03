import React, { useId } from "react";

// The muscle map's body (#148): a futuristic, holographic human — fine
// MEASURE_BLUE contour lines and segmented muscle plates on a dark scan
// grid, trained muscles glowing red (stronger with more sets). Always drawn
// on its own dark display panel, in Solo light and dark mode alike.
//
// Each muscle is drawn once on the body's right side and mirrored, so the
// two sides always match.
//
//   levels: { [muscle]: 0..1 }  (muscleMap.intensity)

export const TRAINED_RED = "#FF4D57";
const BLUE = "#2F8FFF";

// Muscle plates, right half (viewBox 0 0 200 440, body centred on x=100).
const FRONT = {
  traps: ["M106 58 C114 60 121 63 126 67 L117 71 C112 67 108 65 106 63 Z"],
  shoulders: ["M127 67 C141 66 151 77 151 95 C145 93 138 89 131 86 C127 81 125 75 127 67 Z"],
  chest: [
    "M102 74 L123 71 C131 76 135 85 133 95 C125 97 112 97 102 95 Z",
    "M102 98 C112 99 125 99 132 98 C131 104 128 108 124 110 C115 113 108 113 102 111 Z",
  ],
  biceps: ["M146 99 C153 107 156 122 152 139 C146 138 141 128 140 115 C140 107 142 101 146 99 Z"],
  forearms: ["M151 145 C158 158 161 177 158 198 L150 199 C145 183 143 163 145 147 Z"],
  abs: [
    "M102 116 L115 115 C116 122 116 128 116 133 L102 134 Z",
    "M102 137 L116 136 C117 143 117 149 117 154 L102 155 Z",
    "M102 158 L117 157 C117 164 117 170 116 176 L102 177 Z",
    "M102 180 L116 179 C116 185 115 190 114 195 L102 197 Z",
  ],
  obliques: ["M119 117 C127 124 130 150 126 181 L118 190 C121 166 121 140 119 117 Z"],
  quads: [
    "M106 214 C113 212 119 214 122 220 C123 245 121 272 117 300 L110 312 C106 292 104 252 106 214 Z",
    "M124 219 C131 225 134 238 134 252 C134 276 129 296 121 312 C124 286 126 250 124 219 Z",
  ],
  calves: ["M112 332 C123 335 127 358 124 394 L115 395 C111 371 110 350 112 332 Z"],
};

const BACK = {
  traps: ["M100 56 L113 61 C122 65 128 70 130 75 C122 82 112 92 100 104 Z"],
  shoulders: ["M127 67 C141 66 151 77 151 95 C145 93 138 89 131 86 C127 81 125 75 127 67 Z"],
  lats: ["M102 106 C112 96 121 86 128 82 C136 99 134 128 122 151 L104 159 Z"],
  triceps: ["M146 99 C153 107 156 122 152 139 C146 138 141 128 140 115 C140 107 142 101 146 99 Z"],
  forearms: ["M151 145 C158 158 161 177 158 198 L150 199 C145 183 143 163 145 147 Z"],
  lowerBack: ["M102 163 L121 155 C122 170 120 183 116 192 L102 194 Z"],
  glutes: ["M102 199 C120 195 134 205 134 225 C132 241 118 248 102 244 Z"],
  hamstrings: [
    "M104 251 C112 250 118 252 120 258 C120 280 118 300 116 314 L108 314 C104 296 103 271 104 251 Z",
    "M122 256 C129 262 132 272 132 282 C130 298 126 308 120 314 C122 296 123 276 122 256 Z",
  ],
  calves: [
    "M110 331 C116 331 119 336 119 342 C119 356 117 370 114 384 C108 362 107 345 110 331 Z",
    "M121 334 C127 339 130 352 126 380 L117 384 C120 368 122 350 121 334 Z",
  ],
};

// The body's outline, right half — head, neck, torso, arm, leg.
const OUTLINE_HALF =
  "M100 8 C113 8 121 19 121 33 C121 45 115 54 108 57 L109 61 C122 64 140 64 151 74 C158 82 159 94 157 104 C160 120 162 140 162 152 C165 172 166 190 163 204 L160 214 L149 214 C146 200 143 180 142 160 C140 150 138 132 136 120 C134 140 133 160 135 182 C137 194 137 204 136 212 C139 236 139 262 134 292 C131 306 128 316 128 326 C132 350 132 374 128 398 C129 410 128 420 124 428 L110 428 C111 416 110 404 109 396 C106 370 106 348 109 326 C108 316 106 306 105 296 C103 276 102 256 102 240 L100 240";

const MIRROR = "translate(200 0) scale(-1 1)";

// Small "joint" nodes for the futuristic read.
const NODES = [
  [100, 62], [137, 72], [63, 72], [146, 142], [54, 142], [154, 201], [46, 201], [115, 322], [85, 322], [100, 208],
];

export function MuscleBody({ view = "front", levels = {}, className = "", style, label }) {
  const uid = useId().replace(/:/g, "");
  const shapes = view === "back" ? BACK : FRONT;
  const glow = `glow-${uid}`;
  const redGlow = `red-${uid}`;
  const body = `body-${uid}`;
  return (
    <svg viewBox="30 0 140 440" className={className} style={style} role="img" aria-label={label || `${view === "back" ? "Back" : "Front"} muscles`}>
      <defs>
        <filter id={glow} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={redGlow} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id={body} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={BLUE} stopOpacity="0.16" />
          <stop offset="1" stopColor={BLUE} stopOpacity="0.04" />
        </linearGradient>
      </defs>

      {/* Body: a faint blue fill with a glowing contour. */}
      <g filter={`url(#${glow})`}>
        {[null, MIRROR].map((tr, i) => (
          <path key={i} d={OUTLINE_HALF} transform={tr || undefined} fill={`url(#${body})`} stroke={BLUE} strokeOpacity="0.55" strokeWidth="0.9" />
        ))}
      </g>
      {/* Centre line. */}
      <line x1="100" y1="64" x2="100" y2="238" stroke={BLUE} strokeOpacity="0.18" strokeWidth="0.6" strokeDasharray="2 3" />

      {/* Muscle plates. */}
      {Object.entries(shapes).map(([muscle, paths]) => {
        const level = levels[muscle] || 0;
        const on = level > 0;
        return (
          <g key={muscle} data-muscle={muscle} data-level={level} filter={on ? `url(#${redGlow})` : undefined}>
            {paths.flatMap((d, i) =>
              [null, MIRROR].map((tr, j) => (
                <path
                  key={`${i}-${j}`}
                  d={d}
                  transform={tr || undefined}
                  fill={on ? TRAINED_RED : BLUE}
                  fillOpacity={on ? 0.25 + level * 0.65 : 0.07}
                  stroke={on ? TRAINED_RED : BLUE}
                  strokeOpacity={on ? 0.95 : 0.45}
                  strokeWidth="0.7"
                />
              ))
            )}
          </g>
        );
      })}

      {/* Joint nodes. */}
      {NODES.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.3" fill={BLUE} fillOpacity="0.8" />
      ))}
    </svg>
  );
}

// The display panel: dark glass with a faint scan grid, front and back
// side by side, FRONT / BACK labels.
export function MuscleDisplay({ levels, height = 220, compact = false, className = "" }) {
  const grid = `repeating-linear-gradient(0deg, rgba(47,143,255,0.06) 0 1px, transparent 1px 14px), repeating-linear-gradient(90deg, rgba(47,143,255,0.06) 0 1px, transparent 1px 14px)`;
  return (
    <div
      className={`relative overflow-hidden ${compact ? "rounded-xl" : "rounded-3xl"} ${className}`}
      style={{ background: `radial-gradient(120% 90% at 50% 20%, #0F1726 0%, #07090D 70%)`, border: "1px solid rgba(47,143,255,0.22)" }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: grid }} />
      <div className={`relative flex items-end justify-center ${compact ? "gap-0.5 px-1 py-1.5" : "gap-4 px-4 pt-5 pb-3"}`}>
        {["front", "back"].map((v) => (
          <div key={v} className="flex flex-col items-center">
            <MuscleBody view={v} levels={levels} className="w-auto" style={{ height }} />
            {!compact && (
              <span className="text-[9px] font-semibold tracking-[0.22em] mt-1" style={{ color: "rgba(47,143,255,0.7)" }}>
                {v.toUpperCase()}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
