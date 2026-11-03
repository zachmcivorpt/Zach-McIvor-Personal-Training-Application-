import React from "react";

// The muscle map's body (#148): an anatomical figure on clear glass. Each
// muscle is drawn head by head (four quads, three hamstrings, three delt
// heads, two calf heads plus soleus…). A trained muscle is red (deeper with
// more sets); a muscle that's ready is MEASURE_BLUE; muscles the map
// doesn't track (adductors, tibialis, serratus, neck) stay neutral.
//
// Each muscle is drawn once on the body's right half and mirrored, so both
// sides always match.
//
//   levels: { [muscle]: 0..1 }  (muscleMap.intensity)

export const TRAINED_RED = "#FF4D57";
export const READY_BLUE = "#2F8FFF";

// Fill for a tracked muscle: red by level when trained, blue when ready.
export function muscleStyle(level) {
  if (level > 0) return { fill: TRAINED_RED, fillOpacity: Math.round((0.5 + 0.5 * Math.min(1, level)) * 100) / 100 };
  return { fill: READY_BLUE, fillOpacity: 0.32 };
}

// Silhouette, right half: head, neck, shoulder, arm held slightly out,
// torso, leg. Closes just past the centre line so the halves overlap.
const OUTLINE_HALF =
  "M99 10 L100 10 C114 10 122 21 122 36 C122 48 117 57 111 61 L111 70 C120 75 134 76 146 80 C158 84 165 96 165 110 C168 126 171 142 172 156 C177 172 182 196 186 222 C190 232 192 244 189 254 C186 260 179 258 177 250 C175 240 172 232 170 226 C164 204 157 186 154 168 C151 156 149 146 147 132 C146 126 144 120 142 116 C141 140 134 160 130 180 C130 195 136 205 138 218 C140 240 139 268 134 296 C132 308 130 316 130 326 C134 348 134 372 129 396 C130 408 132 420 126 430 L108 430 C109 420 109 410 108 400 C104 378 103 352 106 330 C104 316 104 306 105 296 C103 274 103 252 104 236 C103 234 101 232 99 232 Z";

// The same outline without the closing line down the centre.
const CONTOUR_HALF = OUTLINE_HALF.replace("M99 10 L100 10", "M100 10").replace(/ C103 234 101 232 99 232 Z$/, " C103 234 101 232 100 232");

// Deltoid heads (front + side seen from the front; rear + side from the back).
const DELT_FRONT = "M143 80 C150 82 154 90 152 100 C150 110 147 118 146 125 C142 112 140 100 137 92 C139 87 140 83 143 80 Z";
const DELT_SIDE = "M147 80 C158 84 166 96 165 112 C163 122 158 128 153 130 C153 118 155 104 154 96 C153 88 150 83 147 80 Z";
const FOREARM = [
  "M163 172 C170 175 178 192 183 214 C184 220 182 224 178 222 C170 208 163 190 161 176 Z", // brachioradialis / extensors
  "M157 176 C161 188 167 204 172 221 C169 223 167 221 165 217 C160 205 156 191 157 176 Z", // flexors
];

const FRONT = {
  neutral: [
    "M104 64 C107 66 109 70 110 74 L106 78 C105 74 104 69 104 64 Z", // sternocleidomastoid
    "M138 120 C141 126 140 134 137 140 L133 136 C135 130 136 125 138 120 Z", // serratus
    "M104 236 C108 234 113 238 114 248 C114 262 112 274 109 282 C106 270 104 254 104 236 Z", // adductors
    "M119 334 C123 344 124 362 122 392 C120 390 118 372 117 352 C117 344 118 338 119 334 Z", // tibialis
  ],
  traps: ["M111 68 C120 73 132 76 142 79 C130 82 118 82 108 80 Z"],
  shoulders: [DELT_FRONT, DELT_SIDE],
  chest: [
    "M102 84 C116 82 130 84 138 92 C132 96 118 98 102 98 Z", // upper (clavicular)
    "M102 101 C118 101 133 99 140 95 C145 102 147 112 146 120 C138 126 120 128 104 124 C102 116 102 108 102 101 Z", // sternal
  ],
  biceps: [
    "M150 132 C155 131 159 136 160 145 C161 154 160 162 158 165 C154 158 151 146 150 132 Z", // short head
    "M157 131 C163 134 167 145 168 155 C169 162 166 168 161 166 C162 156 161 142 157 131 Z", // long head
  ],
  forearms: FOREARM,
  abs: [
    "M102 131 L116 129 C117 136 117 142 117 147 L102 148 Z",
    "M102 151 L117 150 C117 157 117 163 116 168 L102 169 Z",
    "M102 172 L116 171 C116 178 115 184 114 189 L102 190 Z",
    "M102 193 L114 192 C113 205 109 216 102 226 Z",
  ],
  obliques: ["M120 132 C128 134 134 140 135 150 C134 166 130 180 127 196 C124 202 120 204 118 200 C119 184 120 160 120 132 Z"],
  quads: [
    "M127 226 C135 232 138 248 138 264 C137 284 133 300 127 314 C125 300 126 280 127 262 C127 248 127 236 127 226 Z", // vastus lateralis
    "M118 222 C124 224 126 240 126 258 C126 280 124 296 121 310 C117 298 114 280 114 258 C114 240 115 228 118 222 Z", // rectus femoris
    "M124 274 C127 284 127 298 124 312 C122 304 122 292 124 274 Z", // vastus intermedius (mostly beneath rectus femoris)
    "M111 280 C117 286 120 298 120 312 C116 318 110 316 107 308 C106 298 107 288 111 280 Z", // vastus medialis
  ],
  calves: [
    "M108 334 C114 338 117 350 116 366 C115 378 112 386 110 384 C107 370 106 350 108 334 Z", // gastrocnemius (inner head)
    "M125 342 C131 354 131 374 127 392 C125 380 125 360 125 342 Z", // soleus
  ],
};

const BACK = {
  neutral: [
    "M104 236 C107 238 109 246 109 256 L106 256 C105 250 104 244 104 236 Z", // adductor magnus
  ],
  lats: ["M112 118 C118 106 129 97 141 93 C146 104 142 120 138 140 C135 158 130 174 126 186 C121 184 117 181 113 177 C113 160 112 140 112 118 Z"],
  traps: [
    "M100 60 C106 64 112 70 118 72 C128 76 136 78 142 80 C130 84 116 88 102 94 Z", // upper traps
    "M102 97 C116 91 130 87 140 85 C131 93 121 101 113 110 C106 122 103 132 101 140 Z", // mid / lower traps
    "M122 96 C130 92 137 92 141 95 C140 104 134 110 125 112 C120 108 119 101 122 96 Z", // infraspinatus / teres
  ],
  shoulders: [DELT_SIDE, "M143 80 C150 82 154 90 152 100 C150 110 147 118 146 125 C142 112 140 100 137 92 C139 87 140 83 143 80 Z"],
  triceps: [
    "M150 124 C155 124 159 132 160 142 C160 152 158 160 156 162 C152 152 150 138 150 124 Z", // long head
    "M156 122 C163 126 167 138 168 152 C168 160 165 166 161 164 C162 152 161 136 156 122 Z", // lateral head
  ],
  forearms: FOREARM,
  lowerBack: ["M102 146 L109 143 C110 160 111 178 110 202 L102 204 Z"], // erector spinae
  glutes: [
    "M122 200 C129 199 135 204 137 214 C131 214 126 212 121 209 Z", // gluteus medius
    "M102 210 C116 206 132 210 136 222 C138 238 132 250 118 252 C110 252 104 250 102 248 Z", // gluteus maximus
  ],
  hamstrings: [
    "M123 256 C131 258 136 268 136 282 C135 296 130 308 122 316 C121 296 121 276 123 256 Z", // biceps femoris
    "M114 256 C119 256 121 266 121 280 C121 296 119 306 116 314 C113 300 112 278 114 256 Z", // semitendinosus
    "M106 258 C110 257 112 263 112 272 C112 290 112 304 112 312 C108 310 105 300 104 288 C104 278 104 266 106 258 Z", // semimembranosus
  ],
  calves: [
    "M108 332 C115 330 118 340 118 352 C118 364 116 372 113 378 C108 368 106 350 108 332 Z", // gastrocnemius, inner head
    "M121 332 C129 334 133 346 131 362 C130 370 126 376 121 378 C120 364 119 348 121 332 Z", // gastrocnemius, outer head
    "M110 380 C116 383 122 383 128 379 C127 388 123 395 118 396 C114 394 111 388 110 380 Z", // soleus
  ],
};

const MIRROR = "translate(200 0) scale(-1 1)";

export function MuscleBody({ view = "front", levels = {}, dark = true, className = "", style, label }) {
  const shapes = view === "back" ? BACK : FRONT;
  const outline = dark ? "rgba(255,255,255,0.22)" : "rgba(10,10,12,0.16)";
  const seam = dark ? "rgba(8,8,10,0.75)" : "rgba(255,255,255,0.95)";
  const neutral = dark ? "rgba(255,255,255,0.10)" : "rgba(10,10,12,0.08)";
  return (
    <svg viewBox="6 4 188 430" className={className} style={style} role="img" aria-label={label || `${view === "back" ? "Back" : "Front"} muscles`}>
      {/* Silhouette: both halves opaque inside one translucent group, so the
          overlap down the centre doesn't show; the contour is drawn open. */}
      <g opacity={dark ? 0.07 : 0.06}>
        {[null, MIRROR].map((tr, i) => (
          <path key={i} d={OUTLINE_HALF} transform={tr || undefined} fill={dark ? "#FFFFFF" : "#0A0A0C"} />
        ))}
      </g>
      {[null, MIRROR].map((tr, i) => (
        <path key={i} d={CONTOUR_HALF} transform={tr || undefined} fill="none" stroke={outline} strokeWidth="0.8" />
      ))}
      {Object.entries(shapes).map(([muscle, paths]) => {
        const level = levels[muscle] || 0;
        const st = muscle === "neutral" ? { fill: neutral, fillOpacity: 1 } : muscleStyle(level);
        return (
          <g key={muscle} data-muscle={muscle} data-level={muscle === "neutral" ? undefined : level}>
            {paths.flatMap((d, i) =>
              [null, MIRROR].map((tr, j) => (
                <path key={`${i}-${j}`} d={d} transform={tr || undefined} fill={st.fill} fillOpacity={st.fillOpacity} stroke={seam} strokeWidth="1.3" strokeLinejoin="round" />
              ))
            )}
          </g>
        );
      })}
    </svg>
  );
}
