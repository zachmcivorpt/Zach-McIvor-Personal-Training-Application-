// Coach video feedback (#223): talking points for the week, from a scan of
// the client's own week (sessions, nutrition, macros, steps, sleep, weight,
// lifts) and the check-in the video answers. The coach edits, deletes,
// adds and reorders them; they're notes for the coach only, kept with the
// unpublished draft on this device — never shown to the client.
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);
const fmtDay = (key) => new Date(key + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" });
const kg = (n) => (Math.round(n * 10) / 10).toString();

// -> [{ id, text, kind: "focus" | "win", source: "scan" }]
export function buildTalkingPoints({ week, nutrition, targets, changes }) {
  const focus = [];
  const wins = [];
  const add = (list, id, text) => list.push({ id, text, kind: list === wins ? "win" : "focus", source: "scan" });

  // Training
  if (week?.sessions?.planned > 0) {
    const missed = week.days.filter((d) => d.session === "missed").map((d) => fmtDay(d.dateKey));
    if (missed.length) add(focus, "sessions", `Missed ${missed.length} of ${week.sessions.planned} planned sessions (${missed.join(", ")}).`);
    else add(wins, "sessions", `All ${week.sessions.planned} planned sessions done.`);
  }
  (week?.bestLifts || []).filter((l) => l.pr).slice(0, 2).forEach((l) => add(wins, `pr-${l.id}`, `PR on ${l.name}: ${l.set.weight} kg × ${l.set.reps}.`));
  (week?.stagnant || []).slice(0, 2).forEach((l) => add(focus, `flat-${l.id}`, `${l.name} has been flat for ${l.sessions} sessions — change the plan?`));
  if (week?.lifted?.changePct !== null && week?.lifted?.changePct !== undefined && week.lifted.changePct <= -15) {
    add(focus, "volume", `Training volume down ${Math.abs(week.lifted.changePct)}% on last week.`);
  }

  // Nutrition
  if (nutrition) {
    if (nutrition.loggedCount < 5) add(focus, "logging", `Food logged on only ${nutrition.loggedCount} of 7 days.`);
    if (nutrition.loggedCount > 0) {
      const kcalGap = nutrition.avgCalories - targets.calories;
      if (nutrition.calorieHits <= 3) {
        add(focus, "calories", `On calorie target ${nutrition.calorieHits} of 7 days — averaging ${nutrition.avgCalories.toLocaleString()} vs ${targets.calories.toLocaleString()} kcal (${kcalGap > 0 ? "+" : "−"}${Math.abs(kcalGap).toLocaleString()}).`);
      } else if (nutrition.calorieHits >= 6) add(wins, "calories", `On calorie target ${nutrition.calorieHits} of 7 days.`);
      if (nutrition.proteinHits <= 4) add(focus, "protein", `Protein hit ${nutrition.proteinHits} of 7 days — averaging ${nutrition.avgProtein} g vs ${targets.protein} g.`);
      else if (nutrition.proteinHits >= 6) add(wins, "protein", `Protein hit ${nutrition.proteinHits} of 7 days.`);
      for (const [key, label, avgKey] of [["carbs", "Carbs", "avgCarbs"], ["fat", "Fat", "avgFat"]]) {
        const p = pct(nutrition[avgKey], targets[key]);
        if (p !== null && Math.abs(p - 100) > 15) add(focus, key, `${label} averaging ${nutrition[avgKey]} g vs ${targets[key]} g (${p}% of target).`);
      }
    }
  }

  // Activity, recovery, bodyweight
  if (week?.steps?.avg !== null && week?.steps?.avg !== undefined && week.steps.pct < 70) {
    add(focus, "steps", `Steps averaged ${week.steps.avg.toLocaleString()} a day (goal ${week.steps.goal.toLocaleString()})${week.steps.days < 7 ? ` — only ${week.steps.days} day${week.steps.days === 1 ? "" : "s"} recorded` : ""}.`);
  }
  if (week?.sleep?.avg !== null && week?.sleep?.avg !== undefined && week.sleep.avg < 6.5) add(focus, "sleep", `Sleep averaged ${week.sleep.avg} h.`);
  if (week?.weight?.avg !== null && week?.weight?.avg !== undefined) {
    const ch = week.weight.change;
    add(ch !== null && ch < 0 ? wins : focus, "weight", `Weight averaged ${kg(week.weight.avg)} kg${ch !== null ? ` (${ch > 0 ? "+" : ch < 0 ? "−" : "±"}${kg(Math.abs(ch))} on last week)` : ""}.`);
  }

  // Check-in
  (changes?.keyChanges || []).forEach((c) => add(focus, `checkin-${c.id}`, `Check-in: ${c.label} ${c.delta > 0 ? "up" : "down"} ${c.prev} → ${c.now}.`));

  return [...focus, ...wins];
}

// A rescan replaces the scan's own points but keeps the coach's: their
// edits, their own notes and anything they removed stays removed.
export function mergeTalkingPoints(current, scanned) {
  if (!current) return scanned;
  const removed = new Set(current.filter((p) => p.removed).map((p) => p.id));
  const kept = current.filter((p) => p.source === "coach" || p.edited || p.removed);
  const keptIds = new Set(kept.map((p) => p.id));
  return [...kept.filter((p) => !p.removed), ...scanned.filter((p) => !keptIds.has(p.id) && !removed.has(p.id)), ...kept.filter((p) => p.removed)];
}
