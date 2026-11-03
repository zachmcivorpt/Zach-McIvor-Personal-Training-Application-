// The Program complete share card (#144): a 1080 × 1350 image (fits an
// Instagram post and a story) with the member's own photo behind their
// results — sessions, total lifted, bodyweight change, PRs and their five
// biggest lift improvements. Every number comes from their own logs and
// weigh-ins; nothing is invented, and anything missing is simply left off.
import { localDateKey } from "../lib/dateKey";

export const CARD_W = 1080;
export const CARD_H = 1350;
const FONT = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const BLUE = "#2F8FFF";

const dateKeyOf = (d) => (typeof d === "string" ? d.slice(0, 10) : d != null ? localDateKey(new Date(d)) : null);

// Bodyweight over the program: the first weigh-in from its start date on
// vs the latest. null with fewer than two.
export function bodyweightChange(weighIns = [], startDate) {
  const list = weighIns
    .filter((w) => Number(w?.weight) > 0 && (!startDate || (dateKeyOf(w.date) || "") >= startDate))
    .sort((a, b) => Number(new Date(a.date)) - Number(new Date(b.date)));
  if (list.length < 2) return null;
  const from = Number(list[0].weight);
  const to = Number(list[list.length - 1].weight);
  return { from, to, change: Math.round((to - from) * 10) / 10 };
}

const kgText = (n) => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)} t` : `${Math.round(n).toLocaleString("en-AU")} kg`);
const signed = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

// What goes on the card, in order (also what the screen shows).
export function shareCardContent({ programName, stats, bodyweight, exercisesById = {} }) {
  const figures = [
    { value: String(stats?.sessions || 0), label: "Sessions" },
    { value: kgText(stats?.volume || 0), label: "Total lifted" },
  ];
  if (bodyweight) figures.push({ value: `${signed(bodyweight.change)} kg`, label: "Bodyweight" });
  else figures.push({ value: String(stats?.prs || 0), label: "PRs" });
  const lifts = (stats?.strength || [])
    .filter((s) => s.pct > 0)
    .slice(0, 5)
    .map((s) => ({ name: exercisesById[s.exerciseId]?.name || "Lift", pct: `+${s.pct}%`, detail: `${s.from} → ${s.to} kg` }));
  return { eyebrow: "PROGRAM COMPLETE", title: programName || "Program complete", figures, lifts };
}

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// Draws the card. `photo` and `logo` are loaded HTMLImageElements (or
// null). Returns false if the canvas can't draw (e.g. tests).
export function drawShareCard(canvas, content, { photo = null, logo = null } = {}) {
  const ctx = canvas?.getContext?.("2d");
  if (!ctx) return false;
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const pad = 80;

  // Background: their photo, cover-fitted, or the APEX near-black.
  ctx.fillStyle = "#0A0A0B";
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  if (photo && photo.width && photo.height) {
    const scale = Math.max(CARD_W / photo.width, CARD_H / photo.height);
    const w = photo.width * scale;
    const h = photo.height * scale;
    ctx.drawImage(photo, (CARD_W - w) / 2, (CARD_H - h) / 2, w, h);
  }
  // Darken so the results always read.
  const shade = ctx.createLinearGradient(0, 0, 0, CARD_H);
  shade.addColorStop(0, photo ? "rgba(10,10,11,0.35)" : "rgba(10,10,11,0)");
  shade.addColorStop(0.38, photo ? "rgba(10,10,11,0.45)" : "rgba(10,10,11,0)");
  shade.addColorStop(1, "rgba(10,10,11,0.94)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  if (logo && logo.width) {
    const h = 54;
    ctx.drawImage(logo, pad, pad, (logo.width / logo.height) * h, h);
  }

  ctx.textBaseline = "alphabetic";
  let y = CARD_H - pad;

  // From the bottom up: lifts, figures, title, eyebrow.
  const lifts = content.lifts || [];
  const rowH = 58;
  for (let i = lifts.length - 1; i >= 0; i--) {
    const l = lifts[i];
    ctx.font = `600 34px ${FONT}`;
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.fillText(l.name, pad, y);
    ctx.textAlign = "right";
    ctx.fillStyle = BLUE;
    ctx.fillText(l.pct, CARD_W - pad, y);
    y -= rowH;
  }
  if (lifts.length) {
    ctx.textAlign = "left";
    ctx.font = `600 24px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText("STRONGER", pad, y - 4);
    y -= 70;
  }

  const figures = content.figures || [];
  const colW = (CARD_W - pad * 2) / Math.max(1, figures.length);
  figures.forEach((f, i) => {
    const x = pad + i * colW;
    ctx.textAlign = "left";
    ctx.font = `600 26px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText(f.label, x, y);
    ctx.font = `600 66px ${FONT}`;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(f.value, x, y - 40);
  });
  y -= 150;

  ctx.textAlign = "left";
  ctx.font = `600 72px ${FONT}`;
  ctx.fillStyle = "#FFFFFF";
  const lines = wrap(ctx, content.title, CARD_W - pad * 2).slice(0, 3);
  for (let i = lines.length - 1; i >= 0; i--) {
    ctx.fillText(lines[i], pad, y);
    y -= 82;
  }
  ctx.font = `600 26px ${FONT}`;
  ctx.fillStyle = BLUE;
  ctx.fillText(content.eyebrow, pad, y - 6);

  // Small sign-off, top right.
  ctx.textAlign = "right";
  ctx.font = `600 24px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText("TRAIN SOLO", CARD_W - pad, pad + 38);
  return true;
}

export function loadImage(src) {
  return new Promise((resolve) => {
    if (!src || typeof Image === "undefined") return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
