// The coach dashboard's "Recent Activity" feed — merged across every
// active client from workout logs, cardio, messages, body stats
// check-ins, form check-ins, and nutrition goal hits. Pulled out as a
// pure function (no hooks/JSX) so it's covered by an automated test
// rather than only verified by eyeballing the rendered dashboard.
export function buildRecentActivity(active, db, resolveNutritionTargets) {
  const activity = [];
  (active || []).forEach((c) => {
    const logs = db.workoutLogs[c.id] || [];
    logs.slice(0, 5).forEach((log) => {
      if (log.cardio) {
        const details = [
          log.cardio.durationMin ? `${log.cardio.durationMin} min` : null,
          log.cardio.distanceKm ? `${log.cardio.distanceKm} km` : null,
          log.cardio.caloriesBurned ? `${log.cardio.caloriesBurned} kcal` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        activity.push({
          type: "cardio",
          date: log.date,
          clientName: c.name,
          clientAvatar: c.avatarUrl,
          verb: "logged",
          subject: log.cardio.activityLabel,
          suffix: details ? ` (${details}).` : ".",
        });
        return;
      }
      const prCount = log.entries.reduce((a, e) => a + e.sets.filter((s) => s.isPR).length, 0);
      activity.push({
        type: "workout",
        date: log.date,
        clientName: c.name,
        clientAvatar: c.avatarUrl,
        verb: "completed",
        subject: log.dayLabel,
        suffix: prCount > 0 ? ` and set ${prCount} new personal best${prCount === 1 ? "" : "s"}.` : ".",
        log,
      });
    });
    const thread = db.messages[c.id] || [];
    thread
      .filter((m) => m.from === "client")
      .slice(-3)
      .forEach((m) => {
        activity.push({
          date: m.date,
          clientName: c.name,
          clientAvatar: c.avatarUrl,
          verb: "sent a message",
          subject: "",
          suffix: `: "${m.text.length > 40 ? m.text.slice(0, 40) + "…" : m.text}"`,
        });
      });
    // Body stats check-ins (weigh-ins) — previously missing from this
    // feed entirely, so a client logging their weight produced no
    // coach-visible activity at all even though every other client
    // action (workouts, messages, check-ins, nutrition goals) did.
    const weighIns = (db.weighIns[c.id] || []).slice(-5);
    weighIns.forEach((w) => {
      activity.push({
        type: "weighin",
        date: w.date,
        clientName: c.name,
        clientAvatar: c.avatarUrl,
        clientId: c.id,
        verb: "logged",
        subject: "a body stats check-in",
        suffix: ` (${w.weight}kg).`,
      });
    });
    const responses = (db.formResponses || {})[c.id] || [];
    responses.slice(0, 5).forEach((r) => {
      const form = (db.forms || []).find((f) => f.id === r.formId);
      activity.push({
        type: "checkin",
        date: r.date,
        clientName: c.name,
        clientAvatar: c.avatarUrl,
        clientId: c.id,
        verb: "submitted",
        subject: form?.name || "a check-in",
        suffix: ".",
        response: r,
        form,
      });
    });
    // Nutrition goal hits — derived live from logged totals vs. the
    // client's own targets, same as everything else in this feed, rather
    // than a separately-tracked notification doc.
    const targets = resolveNutritionTargets(c.nutritionTargets);
    const nutritionDays = (db.nutritionLogs[c.id] || []).slice(-5);
    nutritionDays.forEach((n) => {
      const dateMs = new Date(`${n.date}T12:00:00`).getTime();
      if (Number.isNaN(dateMs)) return;
      if (targets.calories > 0 && (n.calories || 0) >= targets.calories) {
        activity.push({
          type: "nutrition_calories",
          date: dateMs,
          clientName: c.name,
          clientAvatar: c.avatarUrl,
          verb: "hit",
          subject: "their daily calorie goal",
          suffix: ` (${Math.round(n.calories)} / ${targets.calories} kcal).`,
        });
      }
      if (targets.protein > 0 && (n.protein || 0) >= targets.protein) {
        activity.push({
          type: "nutrition_protein",
          date: dateMs,
          clientName: c.name,
          clientAvatar: c.avatarUrl,
          verb: "hit",
          subject: "their protein goal",
          suffix: ` (${Math.round(n.protein)}g / ${targets.protein}g).`,
        });
      }
    });
  });
  activity.sort((a, b) => b.date - a.date);
  return activity.slice(0, 12);
}
