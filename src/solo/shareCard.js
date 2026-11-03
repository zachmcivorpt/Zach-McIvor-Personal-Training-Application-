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

// Total lifted as the full figure in kg ("85,230", label "Kg lifted"), never
// tonnes: "85.2 t" read as unclear (#151).
const kgText = (n) => Math.round(n).toLocaleString("en-AU");
const signed = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

// What goes on the card, in order (also what the screen shows).
// Their progress photos for the program (#145): the first one from its
// start date and the last one, labelled with the program week each was
// taken in. null without two photos on different days.
// "Week N" for a photo taken during the program (capped at the last
// week), else its date.
export function photoLabel(photo, startDate, totalWeeks = 0) {
  const key = dateKeyOf(photo?.date);
  if (startDate && key && key >= startDate) {
    const days = Math.floor((new Date(`${key}T00:00:00`) - new Date(`${startDate}T00:00:00`)) / 86400000);
    const w = Math.floor(days / 7) + 1;
    return `Week ${totalWeeks > 0 ? Math.min(Math.max(w, 1), totalWeeks) : Math.max(w, 1)}`;
  }
  return photo?.date != null ? new Date(photo.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "";
}

export function progressPhotoPair(photos = [], startDate, totalWeeks = 0) {
  const sorted = photos.filter((p) => p?.url).sort((x, y) => Number(new Date(x.date)) - Number(new Date(y.date)));
  // Photos from the program first; if there aren't two on different days,
  // their first and latest photos overall.
  const inProgram = sorted.filter((p) => !startDate || (dateKeyOf(p.date) || "") >= startDate);
  const pick = (list) => (list.length >= 2 && dateKeyOf(list[0].date) !== dateKeyOf(list[list.length - 1].date) ? [list[0], list[list.length - 1]] : null);
  const pair = pick(inProgram) || pick(sorted);
  if (!pair) return null;
  const [first, last] = pair;
  return {
    before: { id: first.id, url: first.url, label: photoLabel(first, startDate, totalWeeks) },
    after: { id: last.id, url: last.url, label: photoLabel(last, startDate, totalWeeks) },
  };
}

export function shareCardContent({ programName, stats, bodyweight, exercisesById = {}, photos = null }) {
  const figures = [
    { value: String(stats?.sessions || 0), label: "Sessions" },
    { value: kgText(stats?.volume || 0), label: "Kg lifted" },
  ];
  if (bodyweight) figures.push({ value: `${signed(bodyweight.change)} kg`, label: "Bodyweight" });
  figures.push({ value: String(stats?.prs || 0), label: "PRs set" });
  const lifts = (stats?.strength || [])
    .filter((s) => s.pct > 0)
    .slice(0, 5)
    .map((s) => ({ name: exercisesById[s.exerciseId]?.name || "Lift", pct: `+${s.pct}%`, detail: `${Math.round(s.from)} → ${Math.round(s.to)} kg` }));
  return {
    eyebrow: "PROGRAM COMPLETE",
    title: programName || "Program complete",
    figures,
    lifts,
    photos: photos ? { before: { label: photos.before.label.toUpperCase() }, after: { label: photos.after.label.toUpperCase() } } : null,
  };
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

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Draw `img` to cover the box (crop, never stretch).
function cover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

// A frosted copy of the background: drawn tiny, then scaled back up
// (works on every browser, unlike ctx.filter).
function frosted(bg) {
  if (typeof document === "undefined") return null;
  const small = document.createElement("canvas");
  small.width = Math.round(CARD_W / 24);
  small.height = Math.round(CARD_H / 24);
  const sctx = small.getContext("2d");
  if (!sctx) return null;
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(bg, 0, 0, small.width, small.height);
  return small;
}

// The card (#145): an APEX gym photo, and over it one pane of frosted glass
// holding the results — program name, week 1 and final-week progress
// photos side by side, the headline figures and the biggest lift gains.
// `background`, `logo`, `before`, `after` are loaded images (or null).
// Returns false if the canvas can't draw (tests).
export function drawShareCard(canvas, content, { background = null, logo = null, before = null, after = null } = {}) {
  const ctx = canvas?.getContext?.("2d");
  if (!ctx) return false;
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const pad = 64;

  // Background: the APEX photo, darkened.
  ctx.fillStyle = "#0A0A0B";
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  if (background?.width) {
    ctx.save();
    ctx.filter = "grayscale(1)";
    cover(ctx, background, 0, 0, CARD_W, CARD_H);
    ctx.restore();
    ctx.fillStyle = "rgba(10,10,11,0.45)";
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  }

  // Header on the photo.
  if (logo?.width) ctx.drawImage(logo, pad, pad - 6, (logo.width / logo.height) * 46, 46);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "right";
  ctx.font = `700 22px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillText("TRAIN SOLO", CARD_W - pad, pad + 30);

  // The glass pane.
  const gx = 48;
  const gy = 150;
  const gw = CARD_W - gx * 2;
  const gh = CARD_H - gy - 48;
  ctx.save();
  roundRect(ctx, gx, gy, gw, gh, 44);
  ctx.clip();
  const frost = background?.width ? frosted(background) : null;
  if (frost) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(frost, 0, 0, CARD_W, CARD_H);
    ctx.fillStyle = "rgba(10,10,11,0.42)";
    ctx.fillRect(gx, gy, gw, gh);
  } else {
    ctx.fillStyle = "rgba(28,28,30,0.9)";
    ctx.fillRect(gx, gy, gw, gh);
  }
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(gx, gy, gw, gh);
  ctx.restore();
  roundRect(ctx, gx + 0.5, gy + 0.5, gw - 1, gh - 1, 44);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const ix = gx + 52;
  const iw = gw - 104;
  let y = gy + 84;

  ctx.textAlign = "left";
  ctx.font = `700 22px ${FONT}`;
  ctx.fillStyle = BLUE;
  ctx.fillText(content.eyebrow.split("").join(String.fromCharCode(8202)), ix, y);
  y += 62;
  ctx.font = `600 54px ${FONT}`;
  ctx.fillStyle = "#FFFFFF";
  for (const line of wrap(ctx, content.title, iw).slice(0, 2)) {
    ctx.fillText(line, ix, y);
    y += 62;
  }

  // Week 1 and final week, side by side.
  const photos = content.photos;
  if (photos && before?.width && after?.width) {
    y += 6;
    const gap = 20;
    const pw = (iw - gap) / 2;
    const ph = 430;
    [
      [before, photos.before.label],
      [after, photos.after.label],
    ].forEach(([img, label], i) => {
      const px = ix + i * (pw + gap);
      ctx.save();
      roundRect(ctx, px, y, pw, ph, 26);
      ctx.clip();
      cover(ctx, img, px, y, pw, ph);
      const fade = ctx.createLinearGradient(0, y + ph - 120, 0, y + ph);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = fade;
      ctx.fillRect(px, y + ph - 120, pw, 120);
      ctx.restore();
      ctx.font = `700 22px ${FONT}`;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(label, px + 22, y + ph - 24);
    });
    y += ph + 66;
  } else {
    y += 30;
  }

  // Figures.
  // Figures across the full width, evenly spaced: the first at the left
  // edge, the last finishing at the right, equal gaps between.
  const figures = content.figures || [];
  const valueSize = figures.length > 3 ? 44 : 50;
  const widths = figures.map((f) => {
    ctx.font = `600 ${valueSize}px ${FONT}`;
    const v = ctx.measureText(f.value).width;
    ctx.font = `500 22px ${FONT}`;
    return Math.max(v, ctx.measureText(f.label).width);
  });
  const gap = figures.length > 1 ? (iw - widths.reduce((a, b) => a + b, 0)) / (figures.length - 1) : 0;
  let fx = ix;
  figures.forEach((f, i) => {
    ctx.textAlign = "left";
    ctx.font = `600 ${valueSize}px ${FONT}`;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(f.value, fx, y);
    ctx.font = `500 22px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText(f.label, fx, y + 36);
    fx += widths[i] + gap;
  });
  y += 92;

  // Stronger: as many of the top gains as fit.
  const lifts = content.lifts || [];
  if (lifts.length) {
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ix, y);
    ctx.lineTo(ix + iw, y);
    ctx.stroke();
    y += 50;
    ctx.textAlign = "left";
    ctx.font = `700 20px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText("STRONGER".split("").join(String.fromCharCode(8202)), ix, y);
    y += 56;
    const bottom = gy + gh - 40;
    // Each lift: name, its estimated max first week → last week, the gain.
    ctx.textAlign = "right";
    ctx.font = `500 20px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText("EST. MAX", ix + iw - 130, y - 56);
    for (const l of lifts) {
      if (y > bottom) break;
      ctx.textAlign = "left";
      ctx.font = `600 28px ${FONT}`;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(l.name, ix, y);
      ctx.textAlign = "right";
      ctx.font = `500 24px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(l.detail, ix + iw - 130, y);
      ctx.font = `600 28px ${FONT}`;
      ctx.fillStyle = BLUE;
      ctx.fillText(l.pct, ix + iw, y);
      y += 50;
    }
  }
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
