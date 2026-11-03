import React from "react";

// The muscle map's body (#148): a solid anatomical figure on a dark panel —
// charcoal silhouette, grey muscle plates separated by dark seams, trained
// muscles in red (deeper red with more sets). Same panel in Solo light and
// dark mode.
//
// Each muscle is drawn once on the body's right half and mirrored, so both
// sides always match.
//
//   levels: { [muscle]: 0..1 }  (muscleMap.intensity)

export const TRAINED_RED = "#FF4D57";
export const MUSCLE_IDLE = "#4A4D57";
export const PANEL_BG = "#15161B";
const BODY = "#2B2D34";
const SEAM = "#16171C";

// Mix the idle grey toward red by training level (0.45 → 1).
export function muscleFill(level) {
  if (!(level > 0)) return MUSCLE_IDLE;
  const k = 0.35 + 0.65 * Math.min(1, level);
  const a = [0x4a, 0x4d, 0x57];
  const b = [0xff, 0x4d, 0x57];
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, "0")).join("").toUpperCase();
}

// Silhouette, right half: head, neck, shoulder, arm held slightly out,
// torso, leg. Closes just past the centre line so the halves overlap.
const OUTLINE_HALF =
  "M99 10 L100 10 C114 10 122 21 122 36 C122 48 117 57 111 61 L111 70 C120 75 134 76 146 80 C158 84 165 96 165 110 C168 126 171 142 172 156 C177 172 182 196 186 222 C190 232 192 244 189 254 C186 260 179 258 177 250 C175 240 172 232 170 226 C164 204 157 186 154 168 C151 156 149 146 147 132 C146 126 144 120 142 116 C141 140 134 160 130 180 C130 195 136 205 138 218 C140 240 139 268 134 296 C132 308 130 316 130 326 C134 348 134 372 129 396 C130 408 132 420 126 430 L108 430 C109 420 109 410 108 400 C104 378 103 352 106 330 C104 316 104 306 105 296 C103 274 103 252 104 236 C103 234 101 232 99 232 Z";

const SHOULDER = "M143 80 C157 82 166 95 165 112 C163 122 158 128 153 130 C150 118 146 104 137 92 C139 87 140 83 143 80 Z";
const FOREARM = [
  "M163 172 C170 175 178 192 183 214 C184 220 182 224 178 222 C170 208 163 190 161 176 Z",
  "M157 176 C161 188 167 204 172 221 C169 223 167 221 165 217 C160 205 156 191 157 176 Z",
];

const FRONT = {
  traps: ["M111 68 C120 73 132 76 142 79 C130 82 118 82 108 80 Z"],
  shoulders: [SHOULDER],
  chest: ["M102 84 C116 82 130 84 138 92 C145 101 148 112 146 120 C138 126 120 128 104 124 C102 118 101 100 102 84 Z"],
  biceps: ["M150 132 C158 130 165 140 168 155 C169 162 166 168 161 166 C156 160 151 148 150 132 Z"],
  forearms: FOREARM,
  abs: [
    "M102 131 L116 129 C117 136 117 142 117 147 L102 148 Z",
    "M102 151 L117 150 C117 157 117 163 116 168 L102 169 Z",
    "M102 172 L116 171 C116 178 115 184 114 189 L102 190 Z",
    "M102 193 L114 192 C113 205 109 216 102 226 Z",
  ],
  obliques: ["M120 130 C130 132 137 138 137 150 C135 166 131 180 127 196 C124 202 120 204 118 200 C119 184 120 160 120 130 Z"],
  quads: [
    "M118 224 C128 224 136 236 137 258 C137 280 133 298 126 312 C121 306 119 296 118 280 C116 262 116 240 118 224 Z",
    "M106 236 C112 232 116 240 116 256 C116 278 118 296 122 314 C114 316 108 308 106 296 C104 278 104 256 106 236 Z",
  ],
  calves: [
    "M124 332 C131 340 132 360 129 384 C127 392 123 392 122 386 C121 368 121 348 124 332 Z",
    "M108 336 C113 340 116 352 116 368 C115 380 112 388 110 386 C107 372 106 352 108 336 Z",
  ],
};

const BACK = {
  lats: ["M107 122 C114 106 128 94 141 91 C146 104 142 120 138 140 C135 158 130 174 126 186 C118 182 110 176 104 170 C104 152 105 134 107 122 Z"],
  traps: ["M100 62 C106 66 112 70 118 72 C128 76 136 78 142 80 C132 88 118 98 109 112 C105 122 102 132 100 142 Z"],
  shoulders: [SHOULDER],
  triceps: ["M150 124 C158 124 166 136 168 152 C168 160 165 166 161 164 C155 156 150 142 150 124 Z"],
  forearms: FOREARM,
  lowerBack: ["M102 148 C106 162 113 174 123 189 C118 197 110 202 102 204 Z"],
  glutes: ["M102 207 C116 201 132 205 136 220 C138 236 132 248 118 250 C110 250 104 248 102 246 Z"],
  hamstrings: [
    "M106 256 C112 252 117 256 118 266 C119 284 118 300 116 312 C110 312 106 304 105 290 C104 278 104 266 106 256 Z",
    "M122 256 C130 256 136 266 136 280 C135 294 130 306 122 314 C121 296 121 276 122 256 Z",
  ],
  calves: [
    "M108 332 C115 330 118 340 118 352 C118 366 115 376 112 380 C108 370 106 352 108 332 Z",
    "M121 332 C129 334 133 346 131 362 C130 372 126 378 121 380 C120 366 119 348 121 332 Z",
  ],
};

const MIRROR = "translate(200 0) scale(-1 1)";

export function MuscleBody({ view = "front", levels = {}, className = "", style, label }) {
  const shapes = view === "back" ? BACK : FRONT;
  return (
    <svg viewBox="6 4 188 430" className={className} style={style} role="img" aria-label={label || `${view === "back" ? "Back" : "Front"} muscles`}>
      {[null, MIRROR].map((tr, i) => (
        <path key={i} d={OUTLINE_HALF} transform={tr || undefined} fill={BODY} />
      ))}
      {Object.entries(shapes).map(([muscle, paths]) => {
        const level = levels[muscle] || 0;
        const fill = muscleFill(level);
        return (
          <g key={muscle} data-muscle={muscle} data-level={level}>
            {paths.flatMap((d, i) =>
              [null, MIRROR].map((tr, j) => (
                <path key={`${i}-${j}`} d={d} transform={tr || undefined} fill={fill} stroke={SEAM} strokeWidth="1.4" strokeLinejoin="round" />
              ))
            )}
          </g>
        );
      })}
    </svg>
  );
}

// The dark display panel: one body (front or back), or both side by side
// when compact (the My Training row's thumbnail).
export function MuscleDisplay({ levels, view = "front", height = 220, compact = false, className = "", children }) {
  return (
    <div className={`relative overflow-hidden ${compact ? "rounded-xl" : "rounded-3xl"} ${className}`} style={{ background: PANEL_BG }}>
      {children}
      <div className={`relative flex items-end justify-center ${compact ? "gap-0.5 px-1 py-1.5" : "px-4 pt-4 pb-4"}`}>
        {(compact ? ["front", "back"] : [view]).map((v) => (
          <MuscleBody key={v} view={v} levels={levels} style={{ height }} />
        ))}
      </div>
    </div>
  );
}
