// Warm-up sets and plate loading for barbell lifts in a Train Solo session
// (#141). Pure, so the arithmetic is tested once.
//
// Assumes a standard 20 kg Olympic bar and the usual gym plates (kg). A
// weight that can't be made exactly from pairs of those plates says so
// rather than pretending.

export const BAR_KG = 20;
export const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];

const round = (n, step = 2.5) => Math.round(n / step) * step;
const tidy = (n) => Math.round(n * 100) / 100;

export function isBarbell(exercise) {
  if (!exercise) return false;
  return exercise.equipment === "Barbell" || /\bbarbell\b/i.test(exercise.name || "");
}

// The weight this lift is being worked up to: the first suggested weight,
// else the heaviest entered so far today, else last time's heaviest.
export function workingWeight({ targets = [], rows = [], previousSets = [] } = {}) {
  const target = targets.map((t) => Number(t?.weight) || 0).find((w) => w > 0);
  if (target) return target;
  const today = Math.max(0, ...rows.map((r) => Number(r?.weight) || 0));
  if (today > 0) return today;
  return Math.max(0, ...previousSets.map((s) => Number(s?.weight) || 0));
}

// Plates for each side of the bar to make `total`. { perSide: [25, 10, 2.5],
// exact: true } — exact false when it can't be made from these plates.
export function platesPerSide(total, bar = BAR_KG) {
  const target = Number(total) || 0;
  if (target <= bar) return { perSide: [], exact: tidy(target) === bar };
  let left = tidy((target - bar) / 2);
  const perSide = [];
  for (const plate of PLATES_KG) {
    while (left >= plate - 1e-9) {
      perSide.push(plate);
      left = tidy(left - plate);
    }
  }
  return { perSide, exact: left === 0 };
}

// Ramp-up sets before the first working set: the empty bar, then about
// 40%, 60% and 80% of the working weight (to the nearest 2.5 kg), fewer
// reps as it gets heavier. Nothing for a working weight under 40 kg.
export function warmupSets(work, bar = BAR_KG) {
  const w = Number(work) || 0;
  if (w < bar + 20) return [];
  const steps = [
    [0, 10],
    [0.4, 5],
    [0.6, 3],
    [0.8, 2],
  ];
  const sets = [];
  for (const [pct, reps] of steps) {
    const weight = pct === 0 ? bar : Math.max(bar, round(w * pct));
    if (weight >= w) continue;
    if (sets.some((s) => s.weight === weight)) continue;
    sets.push({ weight, reps });
  }
  return sets;
}

export function formatPlates(perSide) {
  if (!perSide.length) return "Empty bar";
  const counts = [];
  for (const p of perSide) {
    const last = counts[counts.length - 1];
    if (last && last.plate === p) last.n += 1;
    else counts.push({ plate: p, n: 1 });
  }
  return counts.map(({ plate, n }) => (n > 1 ? `${n} × ${plate}` : `${plate}`)).join(" + ");
}
