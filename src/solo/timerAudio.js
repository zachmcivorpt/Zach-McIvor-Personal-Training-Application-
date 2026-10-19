// A tiny, self-contained rest-timer "ding" — deliberately duplicated from
// src/client/ClientApp.jsx's identical module-private helpers rather than
// exported from there: it's three small functions with zero dependencies
// on anything else in that file, so copying them here is lower risk than
// adding more exports to a Coaching file this phase is explicitly meant
// to leave untouched in behavior. See WorkoutSession's own copy of this
// comment for why Date.now()-based scheduling (not a tick count) and the
// focus/visibilitychange re-arm are both needed on a phone.
let sharedAudioCtx = null;

export function unlockTimerAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
    if (sharedAudioCtx.state === "suspended") sharedAudioCtx.resume();
  } catch {
    // ignore
  }
}

export function playTimerDing() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
    const ctx = sharedAudioCtx;
    if (ctx.state === "suspended") ctx.resume();
    [880, 1175].forEach((freq, i) => {
      const start = ctx.currentTime + i * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.65, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.38);
    });
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
  } catch {
    // ignore — audio is a nice-to-have, never worth breaking the timer over
  }
}

export function armRestTimerAudio() {
  unlockTimerAudio();
}
