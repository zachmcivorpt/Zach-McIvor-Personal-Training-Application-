// GS1 2D codes on food packs — the QR codes ("GS1 Digital Link") and Data
// Matrix codes that are replacing the 1D barcode, first on fresh meat.
// They carry the same product number (GTIN) as a barcode, plus extras a
// barcode can't: for weighed packs, the net weight and a use-by date.
//
//   Digital Link (QR):  https://id.gs1.org/01/09312345678907/10/AB12?3103=000512&17=261130
//   Element string:     ]d2 01 09312345678907 3103 000512 17 261130 10 AB12   (FNC1 = \x1d)
//   Printed form:       (01)09312345678907(3103)000512(17)261130
//
// parseScannedCode(text) turns whatever the scanner read into
// { kind, gtin, netWeightGrams, useBy, raw }:
//   kind "barcode"  — a plain 1D barcode (digits only), unchanged
//   kind "gs1"      — a GS1 QR / Data Matrix code with a product number
//   kind "url"      — any other QR code (a website link): it doesn't
//                     identify the food, so there's nothing to look up
//   kind "unknown"  — anything else
// gtin is normalised to the 13-digit form the barcode lookup uses when it
// starts with 0 (GTIN-14 "0…" = the same item as its EAN-13).

const GS = "\x1d";

// Fixed-length AIs (data length, not counting the AI). Anything not here
// is variable length, ending at FNC1 (GS) or the end of the string.
const FIXED = { "00": 18, "01": 14, "02": 14, 11: 6, 12: 6, 13: 6, 15: 6, 16: 6, 17: 6, 20: 2 };
function fixedLength(ai) {
  if (FIXED[ai] != null) return FIXED[ai];
  if (/^3[1-6]\d\d$/.test(ai)) return 6; // 31nn-36nn: measures, e.g. 3103 = net kg, 3 decimals
  return null;
}
// AI length: 2 digits for 00-02, 1x, 2x; 4 digits for measures (31-36) and
// prices (39); 3 digits for 24x/25x/4xx; 2 digits otherwise.
function aiLength(s) {
  const two = s.slice(0, 2);
  if (/^(3[1-69]|7[0-9]|8[0-9])$/.test(two)) return 4;
  if (/^(2[3-5]|4\d)$/.test(two)) return 3;
  return 2;
}

function checkDigitOk(digits) {
  if (!/^\d{8,14}$/.test(digits)) return false;
  const payload = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < payload.length; i++) sum += Number(payload[payload.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

// GTIN-14 → the form the barcode lookup and the library key use. A leading
// 0 is just padding for an EAN-13; any other indicator digit is kept (9 =
// a variable-measure item, e.g. a weighed meat pack — a stable product
// number, with the weight carried separately in AI 310n).
export function normaliseGtin(gtin) {
  const d = String(gtin || "").replace(/\D/g, "");
  if (d.length === 14 && d[0] === "0") return d.slice(1);
  return d;
}

// A variable-measure trade item (GTIN-14 indicator 9): its product number
// is stable, but it will never be in Open Food Facts.
export function isVariableMeasureGtin(gtin) {
  const d = String(gtin || "").replace(/\D/g, "");
  return d.length === 14 && d[0] === "9";
}

// AI → value map from an element string. Handles FNC1-separated data,
// a leading symbology identifier (]d2, ]Q3, ]C1, ]e0) and the printed
// "(01)…(3103)…" form.
export function parseElementString(text) {
  let s = String(text || "").trim();
  s = s.replace(/^\][A-Za-z]\d/, "");
  if (s.startsWith("(")) {
    const out = {};
    const re = /\((\d{2,4})\)([^(]*)/g;
    let m;
    while ((m = re.exec(s))) out[m[1]] = m[2].trim();
    return Object.keys(out).length ? out : null;
  }
  if (!/^\d/.test(s)) return null;
  const out = {};
  let i = 0;
  while (i < s.length) {
    if (s[i] === GS) {
      i++;
      continue;
    }
    const len = aiLength(s.slice(i, i + 2));
    const ai = s.slice(i, i + len);
    if (!/^\d+$/.test(ai) || ai.length < len) return null;
    i += len;
    const fixed = fixedLength(ai);
    let value;
    if (fixed != null) {
      value = s.slice(i, i + fixed);
      if (value.length < fixed) return null;
      i += fixed;
    } else {
      const end = s.indexOf(GS, i);
      value = end === -1 ? s.slice(i) : s.slice(i, end);
      i = end === -1 ? s.length : end + 1;
    }
    out[ai] = value;
  }
  return Object.keys(out).length ? out : null;
}

// AI → value map from a GS1 Digital Link URL (any domain — brands host
// their own), or null if the URL isn't one.
export function parseDigitalLink(text) {
  let url;
  try {
    url = new URL(String(text || "").trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const keyIdx = parts.findIndex((p, k) => (p === "01" || p === "gtin") && /^\d{8,14}$/.test(parts[k + 1] || ""));
  if (keyIdx === -1) return null;
  const out = { "01": parts[keyIdx + 1].padStart(14, "0") };
  for (let k = keyIdx + 2; k + 1 < parts.length; k += 2) {
    if (/^\d{2,4}$/.test(parts[k])) out[parts[k]] = parts[k + 1];
  }
  url.searchParams.forEach((v, k) => {
    if (/^\d{2,4}$/.test(k)) out[k] = v;
  });
  return out;
}

// Net weight in grams from AI 310n (kg, n decimals) or 320n (lb).
function netWeightGrams(ais) {
  for (const [ai, v] of Object.entries(ais)) {
    const m = /^3([12])0(\d)$/.exec(ai);
    if (!m || !/^\d{6}$/.test(v)) continue;
    const amount = Number(v) / 10 ** Number(m[2]);
    const grams = m[1] === "1" ? amount * 1000 : amount * 453.59237;
    if (grams > 0 && grams < 100000) return Math.round(grams);
  }
  return null;
}

// AI 17 (use by / expiry) or 15 (best before), YYMMDD → "YYYY-MM-DD". A
// day of 00 means the end of that month.
function expiryDateOf(ais) {
  const v = ais["17"] || ais["15"];
  if (!/^\d{6}$/.test(v || "")) return null;
  const y = 2000 + Number(v.slice(0, 2));
  const mo = Number(v.slice(2, 4));
  let d = Number(v.slice(4, 6));
  if (mo < 1 || mo > 12) return null;
  if (d === 0) d = new Date(y, mo, 0).getDate();
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseScannedCode(text) {
  const raw = String(text ?? "");
  const trimmed = raw.trim();
  if (/^\d{6,14}$/.test(trimmed)) return { kind: "barcode", gtin: trimmed, netWeightGrams: null, useBy: null, raw };
  const ais = parseDigitalLink(trimmed) || parseElementString(trimmed);
  if (ais && ais["01"] && checkDigitOk(ais["01"])) {
    return { kind: "gs1", gtin: normaliseGtin(ais["01"]), variableMeasure: isVariableMeasureGtin(ais["01"]), netWeightGrams: netWeightGrams(ais), useBy: expiryDateOf(ais), raw };
  }
  if (/^https?:\/\//i.test(trimmed) || /^www\./i.test(trimmed)) return { kind: "url", gtin: null, netWeightGrams: null, useBy: null, raw };
  return { kind: "unknown", gtin: null, netWeightGrams: null, useBy: null, raw };
}
