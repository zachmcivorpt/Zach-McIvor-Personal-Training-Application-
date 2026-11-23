// #324 (owner, 2026-11-24): the coach's client Progress tab — open a
// progress photo, tag it Front / Side / Back, and compare two dates. Pure
// helpers; the tag is the photo doc's own optional `pose` field.

export const POSES = [
  ["front", "Front"],
  ["side", "Side"],
  ["back", "Back"],
];
export const POSE_LABEL = Object.fromEntries(POSES);

// Oldest first — the order a before/after reads in.
export function sortPhotos(photos) {
  return [...(photos || [])].sort((a, b) => (a.date || 0) - (b.date || 0));
}

// "all" or one pose; untagged photos only show under All.
export function filterByPose(photos, pose) {
  if (!pose || pose === "all") return photos || [];
  return (photos || []).filter((p) => p.pose === pose);
}

// What to compare a photo with first: the EARLIEST other photo of the same
// pose (the "before"); if it's the earliest itself, the latest one; if it has
// no pose (or none match), the same rule over every photo. null if alone.
export function defaultComparison(photo, photos) {
  if (!photo) return null;
  const all = sortPhotos(photos).filter((p) => p.id !== photo.id);
  if (all.length === 0) return null;
  const same = photo.pose ? all.filter((p) => p.pose === photo.pose) : [];
  const pool = same.length ? same : all;
  const earliest = pool[0];
  if ((earliest.date || 0) < (photo.date || 0)) return earliest;
  return pool[pool.length - 1];
}

// Days and kg between two photos, from the client's own weigh-ins
// (`weightFor(photo)` → kg or null). Never invented: kg is null unless both
// photos have a weigh-in.
export function comparisonFigures(a, b, weightFor) {
  if (!a || !b) return null;
  const [first, second] = (a.date || 0) <= (b.date || 0) ? [a, b] : [b, a];
  const days = Math.round(((second.date || 0) - (first.date || 0)) / 86400000);
  const w1 = weightFor?.(first);
  const w2 = weightFor?.(second);
  const kg = w1 != null && w2 != null ? Math.round((Number(w2) - Number(w1)) * 10) / 10 : null;
  return { days, kg };
}

// #325: the client's own Front / Side / Back progress — the FIRST and LATEST
// photo of one pose (null when there's fewer than one).
export function firstAndLatest(photos, pose) {
  const list = sortPhotos(filterByPose(photos, pose));
  if (list.length === 0) return null;
  return { first: list[0], latest: list[list.length - 1], count: list.length };
}

// What to tell a client before each pose (#325). Same order and wording for
// every pose so each set of photos lines up with the last.
export const POSE_GUIDE = {
  front: {
    title: "Front",
    line: "Face the camera square on.",
    steps: [
      "Stand 2–3 metres from the camera, phone at chest height.",
      "Feet hip-width apart, arms relaxed by your sides.",
      "Look straight ahead, stand tall, don't suck in or flex.",
      "Head to feet in the frame.",
    ],
  },
  side: {
    title: "Side",
    line: "Turn 90° so your right side faces the camera.",
    steps: [
      "Same spot and distance as your front photo.",
      "Turn so your right shoulder points at the camera.",
      "Arms relaxed by your sides, or crossed if they hide your waist.",
      "Look straight ahead, not at the camera.",
    ],
  },
  back: {
    title: "Back",
    line: "Turn all the way round, back to the camera.",
    steps: [
      "Same spot and distance as your front photo.",
      "Feet hip-width apart, arms relaxed by your sides.",
      "Hair up or off your shoulders if you can.",
      "Head to feet in the frame.",
    ],
  },
};

// Every pose, every time: the conditions that make photos comparable.
export const PHOTO_CONDITIONS = ["First thing in the morning", "Same light and same spot", "Same clothes as your first set"];
