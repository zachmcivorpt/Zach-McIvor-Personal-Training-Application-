import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Camera, X, Check, Plus, Minus, Trash2, UtensilsCrossed, ScanLine, Flashlight, FlashlightOff } from "lucide-react";
import { Card, BottomSheet, FullScreenOverlay, Field, TextInput, TextArea, PrimaryButton, SecondaryButton, DangerButton } from "../components/ui";
import { FOOD_DATABASE, scaleFoodByUnit, unitsFor, UNIT_DEFS, MICRO_FIELDS_G, MICRO_FIELDS_MG } from "../lib/foodDatabase";
import { lookupBarcode } from "../lib/barcodeLookup";
import { fileToCompressedDataUrl } from "../lib/image";
import { useApp } from "../lib/AppContext";

// Ingredient macros already carry their own rounding, but summing several
// of them (each already rounded to 1dp) drifts into floating-point noise
// like 15.899999999999999 — round the running total too, not just each
// input, so every macro stat shown to a coach or client is clean to 1dp.
function round1(n) {
  return Math.round(n * 10) / 10;
}

/* ============================================================================
   FOOD QUANTITY PICKER — pick how many grams of a food-database item was
   eaten, scaling its per-100g macros live. Shared by every place a food gets
   picked from the database (main food log, photo-meal builder, saved meals).
============================================================================ */

// A unit's display label, pluralised when the quantity isn't exactly 1 (g/ml
// stay unpluralised — "150g", never "150gs").
function unitLabel(unit, qty) {
  if (unit.id === "g" || unit.id === "ml") return unit.label;
  return qty === 1 ? unit.label : unit.pluralLabel || `${unit.label}s`;
}

function presetsFor(food, unit) {
  if (unit.id === "g" || unit.id === "ml") {
    const base = food.defaultQty || 100;
    return [Math.round(base / 2), base, base * 2].filter((v, i, arr) => v > 0 && arr.indexOf(v) === i);
  }
  if (unit.id === "cup") return [0.5, 1, 1.5, 2];
  return [1, 2, 3, 4];
}

export function FoodQuantitySheet({ food, onClose, onConfirm, dark = false }) {
  const [unitId, setUnitId] = useState("g");
  const [qty, setQty] = useState(100);

  const units = food ? unitsFor(food) : [];

  useEffect(() => {
    if (food) {
      setUnitId("g");
      setQty(food.defaultQty || 100);
    }
  }, [food]);

  if (!food) return null;

  const unit = units.find((u) => u.id === unitId) || UNIT_DEFS.g;
  const step = unit.id === "g" || unit.id === "ml" ? 10 : unit.id === "cup" ? 0.25 : 1;
  const presets = presetsFor(food, unit);
  const scaled = scaleFoodByUnit(food, unitId, qty);

  function selectUnit(id) {
    setUnitId(id);
    setQty(id === "g" || id === "ml" ? food.defaultQty || 100 : 1);
  }

  return (
    <BottomSheet dark={dark} open={!!food} onClose={onClose} title={food.name}>
      {food.fromBarcode && (
        <div className={dark ? "flex items-center gap-3 bg-white/[0.03] border border-white/8 rounded-2xl p-3 mb-4" : "flex items-center gap-3 bg-black/[0.03] border border-black/8 rounded-2xl p-3 mb-4"}>
          {food.imageUrl ? (
            <img src={food.imageUrl} alt="" className={dark ? "w-14 h-14 rounded-xl object-cover shrink-0 bg-black" : "w-14 h-14 rounded-xl object-cover shrink-0 bg-white"} />
          ) : (
            <div className={dark ? "w-14 h-14 rounded-xl bg-white/8 flex items-center justify-center shrink-0" : "w-14 h-14 rounded-xl bg-black/8 flex items-center justify-center shrink-0"}>
              <ScanLine size={20} className={dark ? "text-white/25" : "text-black/25"} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            {food.brand && <p className={dark ? "text-white/40 text-[11px] truncate" : "text-black/40 text-[11px] truncate"}>{food.brand}</p>}
            <p className={dark ? "text-white/50 text-xs mt-0.5" : "text-black/50 text-xs mt-0.5"}>
              Matched from the barcode database — not what you scanned? Close this and search or enter it manually instead.
            </p>
          </div>
        </div>
      )}
      <p className={dark ? "text-white/40 text-xs text-center mb-4" : "text-black/40 text-xs text-center mb-4"}>How much did you have?</p>

      {units.length > 1 && (
        <div className="flex flex-wrap justify-center gap-1.5 mb-5">
          {units.map((u) => (
            <button
              key={u.id}
              onClick={() => selectUnit(u.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                unitId === u.id ? (dark ? "bg-white text-black" : "bg-black text-white") : dark ? "bg-white/8 text-white/50" : "bg-black/8 text-black/50"
              }`}
            >
              {unitLabel(u, 2)}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-center gap-4 mb-5">
        <button
          onClick={() => setQty((q) => Math.max(0, Math.round((q - step) * 100) / 100))}
          className={dark ? "w-11 h-11 rounded-full bg-white/8 flex items-center justify-center text-white shrink-0 active:scale-90 transition-transform" : "w-11 h-11 rounded-full bg-black/8 flex items-center justify-center text-black shrink-0 active:scale-90 transition-transform"}
        >
          <Minus size={16} />
        </button>
        <div className="text-center w-28">
          <input
            type="number"
            step={step}
            value={qty}
            onChange={(e) => setQty(Math.max(0, +e.target.value))}
            className={dark ? "w-full text-center text-3xl font-bold text-white outline-none bg-transparent" : "w-full text-center text-3xl font-bold text-black outline-none bg-transparent"}
          />
          <p className={dark ? "text-white/40 text-xs mt-0.5 tracking-wide uppercase" : "text-black/40 text-xs mt-0.5 tracking-wide uppercase"}>{unitLabel(unit, qty)}</p>
        </div>
        <button
          onClick={() => setQty((q) => Math.round((q + step) * 100) / 100)}
          className={dark ? "w-11 h-11 rounded-full bg-white/8 flex items-center justify-center text-white shrink-0 active:scale-90 transition-transform" : "w-11 h-11 rounded-full bg-black/8 flex items-center justify-center text-black shrink-0 active:scale-90 transition-transform"}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="flex flex-wrap justify-center gap-2 mb-5">
        {presets.map((v) => (
          <button
            key={v}
            onClick={() => setQty(v)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold ${
              qty === v ? (dark ? "bg-white text-black" : "bg-black text-white") : dark ? "bg-white/8 text-white/60" : "bg-black/8 text-black/60"
            }`}
          >
            {v}
            {unit.id === "g" || unit.id === "ml" ? unit.label : ` ${unitLabel(unit, v)}`}
          </button>
        ))}
      </div>

      <div className={dark ? "bg-white/8 rounded-2xl p-3.5 grid grid-cols-4 gap-2 mb-5" : "bg-black/8 rounded-2xl p-3.5 grid grid-cols-4 gap-2 mb-5"}>
        {[
          ["Cals", scaled.cals],
          ["Protein", `${scaled.protein}g`],
          ["Carbs", `${scaled.carbs}g`],
          ["Fat", `${scaled.fat}g`],
        ].map(([l, v]) => (
          <div key={l} className="text-center">
            <p className={dark ? "text-white font-bold text-sm" : "text-black font-bold text-sm"}>{v}</p>
            <p className={dark ? "text-white/40 text-[10px] mt-0.5" : "text-black/40 text-[10px] mt-0.5"}>{l}</p>
          </div>
        ))}
      </div>

      <PrimaryButton dark={dark} className="w-full" disabled={qty <= 0} onClick={() => onConfirm(scaled)}>
        <Check size={16} /> ADD
      </PrimaryButton>
    </BottomSheet>
  );
}

/* ============================================================================
   BARCODE SCANNER — real camera + a live decode against Open Food Facts
============================================================================ */

// Product barcode formats only (skips QR/DataMatrix/etc. detection work,
// which speeds up recognition) and opts into the browser's native
// BarcodeDetector API where available — much faster and more reliable
// than the JS-only decoder html5-qrcode falls back to otherwise.
const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.ITF,
];

// Browsers/devices surface a camera failure in wildly inconsistent shapes
// (a structured MediaStream error name, a plain string, an Error with a
// differently-cased message) — check every signal we can rather than one
// brittle substring match, and give an actionable message per real cause
// instead of one catch-all "couldn't start the camera".
function classifyCameraError(err) {
  // html5-qrcode rejects with a plain string in several cases (not an Error
  // object), so `err` itself — not just `err.message` — is a real signal.
  const name = err?.name || "";
  const raw = String(err?.message || err || "");
  const msg = raw.toLowerCase();
  if (name === "NotAllowedError" || msg.includes("permission") || msg.includes("denied")) {
    return { text: "Camera permission denied — allow camera access for this app in your browser/device settings, then try again.", raw };
  }
  if (name === "NotFoundError" || msg.includes("notfound") || msg.includes("no camera")) {
    return { text: "No camera found on this device.", raw };
  }
  if (name === "NotReadableError" || name === "TrackStartError" || msg.includes("notreadable") || msg.includes("trackstart") || msg.includes("in use")) {
    return { text: "Your camera seems to be in use by another app — close other camera apps or tabs and try again.", raw };
  }
  if (name === "OverconstrainedError" || msg.includes("overconstrained") || msg.includes("constraint")) {
    return { text: "This device's camera doesn't support the requested mode.", raw };
  }
  if (msg.includes("mediadevices not supported") || msg.includes("streaming not supported")) {
    return {
      text:
        "This browser can't access the camera here. If you opened this from the app icon on your home screen, try opening the site directly in Safari/Chrome instead — camera access inside installed PWAs is unreliable on some iOS versions.",
      raw,
    };
  }
  return { text: "Couldn't start the camera. Try closing and reopening this screen.", raw };
}

// Html5Qrcode.stop() is NOT an async function — on its unhappy path (no
// active scan session) it does a bare synchronous `throw`, not a rejected
// promise. A `.catch()` chained onto that call never attaches, because the
// throw happens before stop() returns anything to chain onto — it has to be
// a real try/catch. This one helper is used everywhere we stop a scanner so
// that fact only has to be remembered once.
async function safeStop(instance) {
  if (!instance) return;
  try {
    await instance.stop();
  } catch {
    // Already stopped/never started — nothing to do.
  }
}

export function BarcodeScanSheet({ open, onClose, onAdd, dark = false }) {
  const { db, createFood } = useApp();
  const [status, setStatus] = useState("scanning"); // scanning | detected | looking-up | error | not-found
  const [detectedCode, setDetectedCode] = useState("");
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [scanKey, setScanKey] = useState(0);
  const [manual, setManual] = useState({ name: "", cals: "", protein: "", carbs: "", fat: "" });
  const [codeEntryOpen, setCodeEntryOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const lookedUpCodeRef = useRef(""); // the digits actually resolved — tagged onto a food saved to the library so the next scan/entry of the same barcode is instant
  const scannerRef = useRef(null);
  const elId = "barcode-scanner-region";

  function toggleTorch() {
    if (!scannerRef.current) return;
    const next = !torchOn;
    scannerRef.current
      .applyVideoConstraints({ advanced: [{ torch: next }] })
      .then(() => setTorchOn(next))
      .catch(() => {
        // Some devices report torch support but reject the constraint at
        // apply-time anyway — leave the toggle where it was rather than
        // showing it "on" when nothing actually lit up.
      });
  }

  // Runs a barcode (scanned or typed) through the food library first —
  // a barcode saved to the library on a previous "not found" pass should
  // resolve instantly next time, without ever hitting Open Food Facts —
  // then falls back to the real network lookup.
  async function resolveCode(code) {
    const digits = String(code).replace(/\D/g, "");
    lookedUpCodeRef.current = digits;
    setCodeEntryOpen(false);
    setStatus("looking-up");
    const known = (db.customFoods || []).find((f) => f.barcode === digits);
    if (known) {
      onAdd({ ...known, per: known.per ?? 100, defaultQty: known.defaultQty ?? 100 });
      return;
    }
    try {
      const food = await lookupBarcode(digits);
      onAdd(food);
    } catch (err) {
      setError(err.message);
      setErrorDetail("");
      setManual({ name: err.productName || "", cals: "", protein: "", carbs: "", fat: "" });
      setStatus(err.notFound ? "not-found" : "error");
    }
  }

  useEffect(() => {
    if (!open) return;
    setStatus("scanning");
    setError("");
    setErrorDetail("");
    setTorchSupported(false);
    setTorchOn(false);

    // Fail fast with a specific, actionable message when the browser has no
    // camera API at all here (most commonly: opened from the home-screen
    // PWA icon on an iOS version that doesn't support it there) instead of
    // burning through three doomed start() attempts first.
    if (!navigator.mediaDevices?.getUserMedia) {
      const classified = classifyCameraError("navigator.mediaDevices not supported");
      setError(classified.text);
      setErrorDetail(classified.raw);
      setStatus("error");
      return;
    }

    let cancelled = false;
    let stopped = false;
    let activeScanner = null; // the instance that actually succeeded, if any

    async function onDecoded(decodedText) {
      if (stopped) return;
      stopped = true;
      await safeStop(activeScanner);
      // A brief, explicit "got it" beat before the lookup spinner takes
      // over — confirms the decode itself succeeded (this exact code was
      // read off the barcode) as a separate fact from whatever the lookup
      // turns up next, per the "clear feedback when detected" requirement.
      setDetectedCode(decodedText.replace(/\D/g, ""));
      setStatus("detected");
      setTimeout(() => {
        if (!cancelled) resolveCode(decodedText);
      }, 250);
    }

    // A bigger box is both easier to line a barcode up in (less fiddly
    // aiming, fewer failed attempts) and gives the decoder more pixels of
    // the barcode to work with per frame — scale it off the actual
    // viewfinder instead of a fixed size so it's still comfortably sized
    // on a narrow phone and doesn't overrun a wider one. A real barcode is
    // much wider than it is tall, so the box follows that ratio rather
    // than being square.
    const scanConfig = {
      fps: 25,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const width = Math.round(Math.min(340, viewfinderWidth * 0.9));
        const height = Math.round(Math.min(viewfinderHeight * 0.55, width * 0.5));
        return { width, height };
      },
      disableFlip: true,
    };
    const noop = () => {
      // per-frame "no code found yet" callback — expected, ignore
    };

    // Prefer the rear camera, but a device that rejects that constraint
    // (some laptops/tablets, odd Android camera stacks) shouldn't just
    // dead-end — fall back to whatever camera the browser will give us
    // before giving up and showing an error. Each attempt gets its own
    // fresh Html5Qrcode instance — reusing one instance across retries
    // could leave its internal state machine mid-transition from the
    // failed attempt and made every retry fail with an unrelated
    // "already under transition" error instead of a real camera error.
    // The first attempt asks for a sharper feed (1920x1080) than before —
    // more resolution for the decoder to read a small/distant barcode off
    // of — falling back to the old 1280x720 ask, then no constraint at all,
    // so a device that can't deliver 1080p still ends up scanning instead
    // of failing outright.
    const constraintAttempts = [
      { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      { facingMode: "environment" },
      {},
    ];

    (async () => {
      let lastErr = null;
      for (const constraints of constraintAttempts) {
        if (cancelled) return;
        const instance = new Html5Qrcode(elId, {
          verbose: false,
          formatsToSupport: BARCODE_FORMATS,
          useBarCodeDetectorIfSupported: true,
        });
        try {
          await instance.start(constraints, scanConfig, onDecoded, noop);
          if (cancelled) {
            // The sheet closed while this attempt was still resolving —
            // shut down the camera we just opened instead of leaking it.
            safeStop(instance).finally(() => instance.clear());
            return;
          }
          activeScanner = instance;
          scannerRef.current = instance;
          // Torch support varies by device/browser and isn't knowable ahead
          // of a running track — only offer the toggle when this camera
          // actually reports it, rather than showing a button that does
          // nothing on devices/browsers that don't support it (most
          // laptops, some iOS Safari versions).
          try {
            if (instance.getRunningTrackCapabilities?.().torch) setTorchSupported(true);
          } catch {
            // capability check itself isn't universally supported — treat as unsupported
          }
          return;
        } catch (err) {
          lastErr = err;
          try {
            await instance.clear();
          } catch {
            // never got as far as rendering anything — nothing to clear
          }
        }
      }
      if (!cancelled) {
        const classified = classifyCameraError(lastErr);
        setError(classified.text);
        setErrorDetail(classified.raw);
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      // onDecoded may already have stopped (and be mid-lookup on) this exact
      // instance — that's the crash this used to hit: stop() throws
      // synchronously when called on an already-stopped scanner, and that
      // throw happened during cleanup with nothing to catch it. Only stop
      // it here if this cleanup is the first thing to do so.
      const alreadyStopped = stopped;
      stopped = true;
      if (activeScanner && !alreadyStopped) {
        safeStop(activeScanner).finally(() => activeScanner.clear());
      }
      setStatus("scanning");
    };
  }, [open, scanKey]);

  function scanAgain() {
    setScanKey((k) => k + 1);
  }

  function addManual() {
    if (!manual.name.trim()) return;
    const data = {
      name: manual.name.trim(),
      cals: Math.round(Number(manual.cals) || 0),
      protein: Number(manual.protein) || 0,
      carbs: Number(manual.carbs) || 0,
      fat: Number(manual.fat) || 0,
      per: 100,
      defaultQty: 100,
    };
    // Always saved to the shared food library — same as Quick Add — so a
    // barcode that comes up empty only ever needs a manual entry once.
    onAdd(createFood(lookedUpCodeRef.current ? { ...data, barcode: lookedUpCodeRef.current } : data));
  }

  if (!open) return null;

  return (
    <FullScreenOverlay>
      <div className={dark ? "fixed inset-0 z-[135] bg-black flex flex-col overflow-y-auto" : "fixed inset-0 z-[135] bg-white flex flex-col overflow-y-auto"}>
        <div className="flex items-center justify-between px-5 pt-6 pb-3">
          <span className={dark ? "text-white font-semibold" : "text-black font-semibold"}>Scan Barcode</span>
          <button onClick={onClose} className={dark ? "w-9 h-9 flex items-center justify-center text-white/60" : "w-9 h-9 flex items-center justify-center text-black/60"}>
            <X size={20} />
          </button>
        </div>

        {/* Always mounted (just hidden outside "scanning") — html5-qrcode
            looks this element up by id the instant the effect below runs,
            and that must never race a render that's still showing the
            error/not-found screen from a previous attempt. */}
        <div className={status === "scanning" ? "" : "hidden"}>
          <div className="px-5 relative">
            <div id={elId} className={dark ? "w-full rounded-2xl overflow-hidden bg-black" : "w-full rounded-2xl overflow-hidden bg-white"} />
            {torchSupported && (
              <button
                onClick={toggleTorch}
                className={`absolute top-3 right-8 w-10 h-10 rounded-full flex items-center justify-center ${
                  torchOn ? "bg-white text-black" : "bg-black/50 text-white"
                }`}
                aria-label="Toggle flashlight"
              >
                {torchOn ? <Flashlight size={18} /> : <FlashlightOff size={18} />}
              </button>
            )}
          </div>
          <p className={dark ? "text-white/40 text-sm text-center mt-4 px-8" : "text-black/40 text-sm text-center mt-4 px-8"}>Point your camera at a product barcode</p>
          <div className="px-5 mt-4">
            {!codeEntryOpen ? (
              <button onClick={() => setCodeEntryOpen(true)} className={dark ? "w-full text-center text-white/40 text-sm font-medium py-2 underline underline-offset-2" : "w-full text-center text-black/40 text-sm font-medium py-2 underline underline-offset-2"}>
                Not scanning? Type the barcode number instead
              </button>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="Barcode digits"
                  className={dark ? "flex-1 bg-white/5 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none placeholder:text-white/30" : "flex-1 bg-black/5 rounded-xl px-3.5 py-2.5 text-black text-sm outline-none placeholder:text-black/30"}
                />
                <SecondaryButton dark={dark} onClick={() => manualCode.trim() && resolveCode(manualCode)} disabled={!manualCode.trim()} className="px-4">
                  Look up
                </SecondaryButton>
              </div>
            )}
          </div>
        </div>

        {status === "detected" && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className={dark ? "w-14 h-14 rounded-full bg-white flex items-center justify-center mb-4" : "w-14 h-14 rounded-full bg-black flex items-center justify-center mb-4"}>
              <Check size={26} className={dark ? "text-black" : "text-white"} />
            </div>
            <p className={dark ? "text-white font-semibold text-sm" : "text-black font-semibold text-sm"}>Barcode detected</p>
            {detectedCode && <p className={dark ? "text-white/40 text-xs font-mono mt-1" : "text-black/40 text-xs font-mono mt-1"}>{detectedCode}</p>}
          </div>
        )}

        {status === "looking-up" && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className={dark ? "w-10 h-10 border-2 border-white/20 border-t-black rounded-full animate-spin mb-4" : "w-10 h-10 border-2 border-black/20 border-t-black rounded-full animate-spin mb-4"} />
            <p className={dark ? "text-white/50 text-sm" : "text-black/50 text-sm"}>Looking up product...</p>
          </div>
        )}

        {status === "error" && (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
            <p className={dark ? "text-white font-semibold mb-2" : "text-black font-semibold mb-2"}>Couldn't complete that scan</p>
            <p className={dark ? "text-white/40 text-sm mb-3" : "text-black/40 text-sm mb-3"}>{error}</p>
            {errorDetail && (
              <p className={dark ? "text-white/25 text-[11px] font-mono break-all bg-white/[0.03] rounded-lg px-3 py-2" : "text-black/25 text-[11px] font-mono break-all bg-black/[0.03] rounded-lg px-3 py-2"}>{errorDetail}</p>
            )}
            <div className="flex gap-2 mt-6">
              <SecondaryButton dark={dark} onClick={scanAgain} className="px-6">
                Try again
              </SecondaryButton>
              <SecondaryButton dark={dark} onClick={onClose} className="px-6">
                Close
              </SecondaryButton>
            </div>
            <div className={dark ? "w-full mt-6 pt-6 border-t border-white/8" : "w-full mt-6 pt-6 border-t border-black/8"}>
              <p className={dark ? "text-white/30 text-xs mb-2.5" : "text-black/30 text-xs mb-2.5"}>Camera not working? Type the barcode number printed under it:</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="Barcode digits"
                  className={dark ? "flex-1 bg-white/5 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none placeholder:text-white/30" : "flex-1 bg-black/5 rounded-xl px-3.5 py-2.5 text-black text-sm outline-none placeholder:text-black/30"}
                />
                <SecondaryButton dark={dark} onClick={() => manualCode.trim() && resolveCode(manualCode)} disabled={!manualCode.trim()} className="px-4">
                  Look up
                </SecondaryButton>
              </div>
            </div>
          </div>
        )}

        {status === "not-found" && (
          <div className="flex-1 px-5 pb-6">
            <p className={dark ? "text-white/50 text-sm text-center mb-5 whitespace-pre-line" : "text-black/50 text-sm text-center mb-5 whitespace-pre-line"}>{error}</p>
            <p className={dark ? "text-white/30 text-xs tracking-wide mb-2" : "text-black/30 text-xs tracking-wide mb-2"}>ADD IT MANUALLY — PER 100G</p>
            <div className="space-y-2.5">
              <TextInput dark={dark}
                value={manual.name}
                onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
                placeholder="Product name"
              />
              <div className="grid grid-cols-4 gap-1.5">
                {["cals", "protein", "carbs", "fat"].map((k) => (
                  <input
                    key={k}
                    type="number"
                    inputMode="decimal"
                    value={manual[k]}
                    onChange={(e) => setManual((m) => ({ ...m, [k]: e.target.value }))}
                    placeholder={k}
                    className={dark ? "bg-white/5 rounded-lg text-center text-white text-xs py-2.5 outline-none placeholder:text-white/25 placeholder:capitalize" : "bg-black/5 rounded-lg text-center text-black text-xs py-2.5 outline-none placeholder:text-black/25 placeholder:capitalize"}
                  />
                ))}
              </div>
            </div>
            <p className={dark ? "text-white/30 text-[11px] mt-3" : "text-black/30 text-[11px] mt-3"}>Saved to the food library automatically — instant next time.</p>
            <PrimaryButton dark={dark} className="w-full mt-4" disabled={!manual.name.trim()} onClick={addManual}>
              <Check size={16} /> ADD
            </PrimaryButton>
            <button onClick={scanAgain} className={dark ? "w-full text-center text-white/40 text-sm font-medium py-3" : "w-full text-center text-black/40 text-sm font-medium py-3"}>
              Scan a different item
            </button>
          </div>
        )}
      </div>
    </FullScreenOverlay>
  );
}

/* ============================================================================
   QUICK ADD — log a single food by typing its name and calories/macros
   directly, for anything not in the database and not worth a full barcode
   scan (a restaurant meal, a homemade dish). Mirrors the barcode sheet's
   manual-entry fallback, but reachable straight from "Add to <meal>"
   instead of only after a failed scan.
============================================================================ */

const MICRO_LABELS = {
  satFat: "Saturated Fat",
  transFat: "Trans Fat",
  fiber: "Fiber",
  sugar: "Sugar",
  sodium: "Sodium",
  potassium: "Potassium",
  calcium: "Calcium",
  iron: "Iron",
  cholesterol: "Cholesterol",
  vitaminC: "Vitamin C",
};

const EMPTY_QUICK_ADD = {
  name: "",
  cals: "",
  protein: "",
  carbs: "",
  fat: "",
  satFat: "",
  transFat: "",
  fiber: "",
  sugar: "",
  sodium: "",
  potassium: "",
  calcium: "",
  iron: "",
  cholesterol: "",
  vitaminC: "",
};

export function QuickAddFoodSheet({ open, onClose, onAdd, dark = false }) {
  const { createFood } = useApp();
  const [manual, setManual] = useState(EMPTY_QUICK_ADD);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setManual(EMPTY_QUICK_ADD);
      setMoreOpen(false);
    }
  }, [open]);

  function submit() {
    if (!manual.name.trim()) return;
    const data = {
      name: manual.name.trim(),
      cals: Math.round(Number(manual.cals) || 0),
      protein: Number(manual.protein) || 0,
      carbs: Number(manual.carbs) || 0,
      fat: Number(manual.fat) || 0,
      per: 100,
      defaultQty: 100,
    };
    // A micronutrient field is only ever included when the coach/client
    // actually typed something in — an untouched field means "unknown", not
    // "zero", same distinction the barcode-scan path makes.
    [...MICRO_FIELDS_G, ...MICRO_FIELDS_MG].forEach((key) => {
      if (manual[key] !== "") data[key] = Number(manual[key]) || 0;
    });
    // Always saved to the shared food library — a food only needs to be
    // typed in once, then it's searchable by every client from here on.
    onAdd(createFood(data));
  }

  return (
    <BottomSheet dark={dark} open={open} onClose={onClose} title="Quick Add">
      <p className={dark ? "text-white/30 text-xs tracking-wide mb-2" : "text-black/30 text-xs tracking-wide mb-2"}>LOG A FOOD BY NAME</p>
      <div className="space-y-2.5">
        <TextInput dark={dark}
          value={manual.name}
          onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
          placeholder="e.g. Honey Chicken Sushi Roll"
        />
        <div className="grid grid-cols-4 gap-1.5">
          {["cals", "protein", "carbs", "fat"].map((k) => (
            <input
              key={k}
              type="number"
              inputMode="decimal"
              value={manual[k]}
              onChange={(e) => setManual((m) => ({ ...m, [k]: e.target.value }))}
              placeholder={k}
              className={dark ? "bg-white/5 rounded-lg text-center text-white text-xs py-2.5 outline-none placeholder:text-white/25 placeholder:capitalize" : "bg-black/5 rounded-lg text-center text-black text-xs py-2.5 outline-none placeholder:text-black/25 placeholder:capitalize"}
            />
          ))}
        </div>
      </div>

      <button
        onClick={() => setMoreOpen((v) => !v)}
        className={dark ? "text-white/40 text-xs font-semibold mt-3" : "text-black/40 text-xs font-semibold mt-3"}
      >
        {moreOpen ? "− Hide micronutrients" : "+ Add micronutrients (optional)"}
      </button>
      {moreOpen && (
        <div className="grid grid-cols-2 gap-2 mt-2.5">
          {[...MICRO_FIELDS_G, ...MICRO_FIELDS_MG].map((key) => (
            <label key={key} className="block">
              <span className={dark ? "text-white/30 text-[10px]" : "text-black/30 text-[10px]"}>
                {MICRO_LABELS[key]} ({MICRO_FIELDS_G.includes(key) ? "g" : "mg"})
              </span>
              <input
                type="number"
                inputMode="decimal"
                value={manual[key]}
                onChange={(e) => setManual((m) => ({ ...m, [key]: e.target.value }))}
                placeholder="0"
                className={dark ? "w-full bg-white/5 rounded-lg text-white text-xs py-2 px-2.5 mt-0.5 outline-none placeholder:text-white/20" : "w-full bg-black/5 rounded-lg text-black text-xs py-2 px-2.5 mt-0.5 outline-none placeholder:text-black/20"}
              />
            </label>
          ))}
        </div>
      )}

      <p className={dark ? "text-white/30 text-[11px] mt-3" : "text-black/30 text-[11px] mt-3"}>Saved to the food library automatically — searchable by name next time.</p>
      <PrimaryButton dark={dark} className="w-full mt-4" disabled={!manual.name.trim()} onClick={submit}>
        <Check size={16} /> Log it
      </PrimaryButton>
    </BottomSheet>
  );
}

/* ============================================================================
   PHOTO MEAL — attach a reference photo, then build the meal by hand.
   There's no safe way to run real food-photo recognition from a public
   static site (it would mean shipping an API key in the client bundle), so
   this keeps the photo purely as a personal reference image and lets the
   client enter ingredients/macros themselves — same builder as Create Meal.
============================================================================ */

export function PhotoEstimateSheet({ open, onClose, onAdd, onSaveAsMeal, dark = false }) {
  const [status, setStatus] = useState("pick"); // pick | build
  const [photoUrl, setPhotoUrl] = useState(null);
  const [name, setName] = useState("");
  const [ingredients, setIngredients] = useState([]);
  const [search, setSearch] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ name: "", cals: 0, protein: 0, carbs: 0, fat: 0 });
  const [pendingFood, setPendingFood] = useState(null);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (open) {
      setStatus("pick");
      setPhotoUrl(null);
      setName("");
      setIngredients([]);
      setSearch("");
      setManualOpen(false);
      setBarcodeOpen(false);
    }
  }, [open]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataUrl(file, 900, 0.78);
      setPhotoUrl(dataUrl);
    } catch {
      // bad file — still let them log the meal, just without a photo
    }
    setStatus("build");
  }

  const rawTotals = ingredients.reduce(
    (a, i) => ({ cals: a.cals + i.cals, protein: a.protein + i.protein, carbs: a.carbs + i.carbs, fat: a.fat + i.fat }),
    { cals: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const totals = { cals: Math.round(rawTotals.cals), protein: round1(rawTotals.protein), carbs: round1(rawTotals.carbs), fat: round1(rawTotals.fat) };

  const filtered = FOOD_DATABASE.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));

  function addIngredient(food) {
    setIngredients((list) => [...list, { ...food, id: `ing_${Math.random().toString(36).slice(2, 8)}` }]);
    setSearch("");
  }

  function addManual() {
    if (!manual.name.trim()) return;
    addIngredient({ ...manual });
    setManual({ name: "", cals: 0, protein: 0, carbs: 0, fat: 0 });
    setManualOpen(false);
  }

  function removeIngredient(id) {
    setIngredients((list) => list.filter((i) => i.id !== id));
  }

  function buildResult() {
    return { name: name.trim() || "Meal photo", ingredients, photoUrl, ...totals };
  }

  return (
    <BottomSheet dark={dark} open={open} onClose={onClose} title="Log a Meal Photo">
      {status === "pick" && (
        <div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
          <button
            onClick={() => fileRef.current?.click()}
            className={dark ? "w-full flex flex-col items-center gap-3 bg-white/5 border border-dashed border-white/15 rounded-2xl py-10" : "w-full flex flex-col items-center gap-3 bg-black/5 border border-dashed border-black/15 rounded-2xl py-10"}
          >
            <Camera size={28} className={dark ? "text-white/40" : "text-black/40"} />
            <span className={dark ? "text-white/60 text-sm font-medium" : "text-black/60 text-sm font-medium"}>Take or choose a photo of your meal</span>
          </button>
          <div className={dark ? "flex items-start gap-2 mt-4 bg-white/[0.03] rounded-xl p-3" : "flex items-start gap-2 mt-4 bg-black/[0.03] rounded-xl p-3"}>
            <UtensilsCrossed size={14} className={dark ? "text-white/30 shrink-0 mt-0.5" : "text-black/30 shrink-0 mt-0.5"} />
            <p className={dark ? "text-white/30 text-[11px] leading-relaxed" : "text-black/30 text-[11px] leading-relaxed"}>
              We'll keep the photo as a reference — add the ingredients yourself below and we'll total up the macros.
            </p>
          </div>
        </div>
      )}

      {status === "build" && (
        <div>
          {photoUrl && <img src={photoUrl} alt="Your meal" className="w-full h-40 object-cover rounded-2xl mb-4" />}

          <Field dark={dark} label="MEAL NAME">
            <TextInput dark={dark} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lunch" />
          </Field>

          {ingredients.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {ingredients.map((ing) => (
                <div key={ing.id} className={dark ? "flex items-center justify-between bg-white/5 rounded-xl px-3.5 py-2.5" : "flex items-center justify-between bg-black/5 rounded-xl px-3.5 py-2.5"}>
                  <div>
                    <p className={dark ? "text-white text-sm font-medium" : "text-black text-sm font-medium"}>{ing.name}</p>
                    <p className={dark ? "text-white/40 text-xs" : "text-black/40 text-xs"}>
                      {ing.cals} kcal · P{ing.protein} C{ing.carbs} F{ing.fat}
                    </p>
                  </div>
                  <button onClick={() => removeIngredient(ing.id)} className={dark ? "w-7 h-7 flex items-center justify-center text-white/30" : "w-7 h-7 flex items-center justify-center text-black/30"}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className={dark ? "bg-white/8 rounded-2xl p-3.5 grid grid-cols-4 gap-2 mt-4" : "bg-black/8 rounded-2xl p-3.5 grid grid-cols-4 gap-2 mt-4"}>
            {[
              ["Cals", totals.cals],
              ["Protein", `${totals.protein}g`],
              ["Carbs", `${totals.carbs}g`],
              ["Fat", `${totals.fat}g`],
            ].map(([l, v]) => (
              <div key={l} className="text-center">
                <p className={dark ? "text-white font-bold text-sm" : "text-black font-bold text-sm"}>{v}</p>
                <p className={dark ? "text-white/40 text-[10px] mt-0.5" : "text-black/40 text-[10px] mt-0.5"}>{l}</p>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <p className={dark ? "text-white/40 text-xs tracking-wide mb-2" : "text-black/40 text-xs tracking-wide mb-2"}>ADD INGREDIENT</p>
            <div className={dark ? "flex items-center gap-2 bg-white/8 rounded-xl px-3 py-2.5 mb-2" : "flex items-center gap-2 bg-black/8 rounded-xl px-3 py-2.5 mb-2"}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search foods"
                className={dark ? "bg-transparent outline-none text-white text-sm flex-1 placeholder:text-white/30" : "bg-transparent outline-none text-black text-sm flex-1 placeholder:text-black/30"}
              />
            </div>
            {search && (
              <div className="space-y-1 mb-2 max-h-40 overflow-y-auto">
                {filtered.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      setPendingFood(f);
                      setSearch("");
                    }}
                    className={dark ? "w-full flex items-center justify-between py-2.5 border-b border-white/5 last:border-0" : "w-full flex items-center justify-between py-2.5 border-b border-black/5 last:border-0"}
                  >
                    <span className={dark ? "text-white text-sm" : "text-black text-sm"}>{f.name}</span>
                    <span className={dark ? "text-white/40 text-xs" : "text-black/40 text-xs"}>{f.cals} kcal / 100g</span>
                  </button>
                ))}
              </div>
            )}

            {!manualOpen ? (
              <div className="flex gap-2">
                <button
                  onClick={() => setBarcodeOpen(true)}
                  className={dark ? "flex-1 flex items-center justify-center gap-1.5 text-white/50 text-xs font-medium py-2.5 rounded-xl bg-white/[0.03]" : "flex-1 flex items-center justify-center gap-1.5 text-black/50 text-xs font-medium py-2.5 rounded-xl bg-black/[0.03]"}
                >
                  <ScanLine size={14} /> Scan barcode
                </button>
                <button
                  onClick={() => setManualOpen(true)}
                  className={dark ? "flex-1 flex items-center justify-center gap-1.5 text-white/50 text-xs font-medium py-2.5 rounded-xl bg-white/[0.03]" : "flex-1 flex items-center justify-center gap-1.5 text-black/50 text-xs font-medium py-2.5 rounded-xl bg-black/[0.03]"}
                >
                  <Plus size={13} /> Add manually
                </button>
              </div>
            ) : (
              <div className={dark ? "bg-white/[0.03] rounded-xl p-3 space-y-2" : "bg-black/[0.03] rounded-xl p-3 space-y-2"}>
                <TextInput dark={dark}
                  value={manual.name}
                  onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
                  placeholder="Ingredient name"
                  className="text-sm"
                />
                <div className="grid grid-cols-4 gap-1.5">
                  {["cals", "protein", "carbs", "fat"].map((k) => (
                    <input
                      key={k}
                      type="number"
                      value={manual[k]}
                      onChange={(e) => setManual((m) => ({ ...m, [k]: +e.target.value }))}
                      placeholder={k}
                      className={dark ? "bg-white/5 rounded-lg text-center text-white text-xs py-2 outline-none placeholder:text-white/25 placeholder:capitalize" : "bg-black/5 rounded-lg text-center text-black text-xs py-2 outline-none placeholder:text-black/25 placeholder:capitalize"}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <SecondaryButton dark={dark} className="flex-1 !py-2" onClick={() => setManualOpen(false)}>
                    Cancel
                  </SecondaryButton>
                  <PrimaryButton dark={dark} className="flex-1 !py-2" onClick={addManual}>
                    Add
                  </PrimaryButton>
                </div>
              </div>
            )}
          </div>

          <PrimaryButton dark={dark} className="w-full mt-5" disabled={ingredients.length === 0} onClick={() => onAdd(buildResult())}>
            <Check size={16} /> ADD TO TODAY
          </PrimaryButton>
          {onSaveAsMeal && (
            <SecondaryButton dark={dark}
              className="w-full mt-2.5"
              disabled={!name.trim() || ingredients.length === 0}
              onClick={() => onSaveAsMeal(buildResult())}
            >
              <UtensilsCrossed size={15} /> ALSO SAVE AS A MEAL
            </SecondaryButton>
          )}
        </div>
      )}

      <FoodQuantitySheet
        food={pendingFood}
        onClose={() => setPendingFood(null)}
        onConfirm={(scaled) => {
          addIngredient(scaled);
          setPendingFood(null);
        }}
      />
      <BarcodeScanSheet
        open={barcodeOpen}
        onClose={() => setBarcodeOpen(false)}
        onAdd={(food) => {
          setBarcodeOpen(false);
          setPendingFood(food);
        }}
      />
    </BottomSheet>
  );
}

/* ============================================================================
   CREATE MEAL — build a reusable meal from ingredients, save it
============================================================================ */

const MEAL_TYPE_OPTIONS = ["Breakfast", "Lunch", "Dinner", "Snacks"];

export function CreateMealSheet({ open, onClose, onSave, prefill, showMealTypes = false, dark = false }) {
  const [name, setName] = useState("");
  const [ingredients, setIngredients] = useState([]);
  const [mealTypes, setMealTypes] = useState([]);
  const [instructions, setInstructions] = useState("");
  const [search, setSearch] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ name: "", cals: 0, protein: 0, carbs: 0, fat: 0 });
  const [pendingFood, setPendingFood] = useState(null);
  const [barcodeOpen, setBarcodeOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setName(prefill?.name || "");
      setIngredients(prefill?.ingredients?.map((i) => ({ ...i, id: i.id || `ing_${Math.random().toString(36).slice(2, 8)}` })) || []);
      setMealTypes(prefill?.mealTypes || []);
      setInstructions(prefill?.instructions || "");
      setSearch("");
      setManualOpen(false);
      setBarcodeOpen(false);
    }
  }, [open, prefill]);

  function toggleMealType(type) {
    setMealTypes((list) => (list.includes(type) ? list.filter((t) => t !== type) : [...list, type]));
  }

  const rawTotals = ingredients.reduce(
    (a, i) => ({ cals: a.cals + i.cals, protein: a.protein + i.protein, carbs: a.carbs + i.carbs, fat: a.fat + i.fat }),
    { cals: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const totals = { cals: Math.round(rawTotals.cals), protein: round1(rawTotals.protein), carbs: round1(rawTotals.carbs), fat: round1(rawTotals.fat) };

  const filtered = FOOD_DATABASE.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));

  function addIngredient(food) {
    setIngredients((list) => [...list, { ...food, id: `ing_${Math.random().toString(36).slice(2, 8)}` }]);
    setSearch("");
  }

  function addManual() {
    if (!manual.name.trim()) return;
    addIngredient({ ...manual });
    setManual({ name: "", cals: 0, protein: 0, carbs: 0, fat: 0 });
    setManualOpen(false);
  }

  function removeIngredient(id) {
    setIngredients((list) => list.filter((i) => i.id !== id));
  }

  function save() {
    if (!name.trim() || ingredients.length === 0) return;
    onSave({ name: name.trim(), ingredients, mealTypes, instructions: instructions.trim(), ...totals });
  }

  const muted40 = dark ? "text-white/40" : "text-black/40";
  const muted30 = dark ? "text-white/30" : "text-black/30";
  const primaryText = dark ? "text-white" : "text-black";
  const rowBg = dark ? "bg-white/8" : "bg-black/5";
  const totalsBg = dark ? "bg-white/8" : "bg-black/8";
  const faintBg = dark ? "bg-white/[0.06]" : "bg-black/[0.03]";
  const faintButtonText = dark ? "text-white/50" : "text-black/50";
  const rowInputBg = dark ? "bg-white/8" : "bg-black/5";
  const dividerBorder = dark ? "border-white/8" : "border-black/5";

  return (
    <BottomSheet open={open} onClose={onClose} title="Create Meal" dark={dark}>
      <Field label="MEAL NAME" dark={dark}>
        <TextInput dark={dark} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My go-to breakfast" />
      </Field>

      {showMealTypes && (
        <Field
          label="WHEN SHOULD THIS BE SUGGESTED?"
          hint="Used by Auto-Build to only suggest this meal for the right slot. Leave all unchecked to allow any time."
          dark={dark}
        >
          <div className="flex flex-wrap gap-2">
            {MEAL_TYPE_OPTIONS.map((type) => {
              const active = mealTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleMealType(type)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    active ? (dark ? "bg-white text-black" : "bg-black text-white") : `${rowBg} ${muted40}`
                  }`}
                >
                  {type}
                </button>
              );
            })}
          </div>
        </Field>
      )}

      <Field label="HOW TO PREPARE (OPTIONAL)" hint="Shown to the client when they tap this meal in their plan" dark={dark}>
        <TextArea
          dark={dark}
          rows={4}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={"1. Cook the chicken breast until done...\n2. ..."}
        />
      </Field>

      {ingredients.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {ingredients.map((ing) => (
            <div key={ing.id} className={`flex items-center justify-between ${rowBg} rounded-xl px-3.5 py-2.5`}>
              <div>
                <p className={`${primaryText} text-sm font-medium`}>{ing.name}</p>
                <p className={`${muted40} text-xs`}>
                  {ing.cals} kcal · P{ing.protein} C{ing.carbs} F{ing.fat}
                </p>
              </div>
              <button onClick={() => removeIngredient(ing.id)} className={`w-7 h-7 flex items-center justify-center ${muted30}`}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={`${totalsBg} rounded-2xl p-3.5 grid grid-cols-4 gap-2 mt-4`}>
        {[
          ["Cals", totals.cals],
          ["Protein", `${totals.protein}g`],
          ["Carbs", `${totals.carbs}g`],
          ["Fat", `${totals.fat}g`],
        ].map(([l, v]) => (
          <div key={l} className="text-center">
            <p className={`${primaryText} font-bold text-sm`}>{v}</p>
            <p className={`${muted40} text-[10px] mt-0.5`}>{l}</p>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <p className={`${muted40} text-xs tracking-wide mb-2`}>ADD INGREDIENT</p>
        <div className={`flex items-center gap-2 ${totalsBg} rounded-xl px-3 py-2.5 mb-2`}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search foods"
            className={`bg-transparent outline-none ${primaryText} text-sm flex-1 ${dark ? "placeholder:text-white/30" : "placeholder:text-black/30"}`}
          />
        </div>
        {search && (
          <div className="space-y-1 mb-2 max-h-40 overflow-y-auto">
            {filtered.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setPendingFood(f);
                  setSearch("");
                }}
                className={`w-full flex items-center justify-between py-2.5 border-b ${dividerBorder} last:border-0`}
              >
                <span className={`${primaryText} text-sm`}>{f.name}</span>
                <span className={`${muted40} text-xs`}>{f.cals} kcal / 100g</span>
              </button>
            ))}
          </div>
        )}

        {!manualOpen ? (
          <div className="flex gap-2">
            <button
              onClick={() => setBarcodeOpen(true)}
              className={`flex-1 flex items-center justify-center gap-1.5 ${faintButtonText} text-xs font-medium py-2.5 rounded-xl ${faintBg}`}
            >
              <ScanLine size={14} /> Scan barcode
            </button>
            <button
              onClick={() => setManualOpen(true)}
              className={`flex-1 flex items-center justify-center gap-1.5 ${faintButtonText} text-xs font-medium py-2.5 rounded-xl ${faintBg}`}
            >
              <Plus size={13} /> Add manually
            </button>
          </div>
        ) : (
          <div className={`${faintBg} rounded-xl p-3 space-y-2`}>
            <TextInput
              dark={dark}
              value={manual.name}
              onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
              placeholder="Ingredient name"
              className="text-sm"
            />
            <div className="grid grid-cols-4 gap-1.5">
              {["cals", "protein", "carbs", "fat"].map((k) => (
                <input
                  key={k}
                  type="number"
                  value={manual[k]}
                  onChange={(e) => setManual((m) => ({ ...m, [k]: +e.target.value }))}
                  placeholder={k}
                  className={`${rowInputBg} rounded-lg text-center ${primaryText} text-xs py-2 outline-none ${
                    dark ? "placeholder:text-white/25" : "placeholder:text-black/25"
                  } placeholder:capitalize`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <SecondaryButton dark={dark} className="flex-1 !py-2" onClick={() => setManualOpen(false)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton dark={dark} className="flex-1 !py-2" onClick={addManual}>
                Add
              </PrimaryButton>
            </div>
          </div>
        )}
      </div>

      <PrimaryButton dark={dark} className="w-full mt-5" disabled={!name.trim() || ingredients.length === 0} onClick={save}>
        <Check size={16} /> SAVE MEAL
      </PrimaryButton>

      <FoodQuantitySheet
        food={pendingFood}
        onClose={() => setPendingFood(null)}
        onConfirm={(scaled) => {
          addIngredient(scaled);
          setPendingFood(null);
        }}
      />
      <BarcodeScanSheet
        open={barcodeOpen}
        onClose={() => setBarcodeOpen(false)}
        onAdd={(food) => {
          setBarcodeOpen(false);
          setPendingFood(food);
        }}
      />
    </BottomSheet>
  );
}

/* ============================================================================
   SAVED MEALS — the client's personal meal library, one-tap logging
============================================================================ */

export function SavedMealsSection({ meals, onCreateNew, onLog, onDelete, dark = false }) {
  const [logging, setLogging] = useState(null); // meal being logged (choosing category)
  const [confirmDelete, setConfirmDelete] = useState(null);
  const categories = ["Breakfast", "Lunch", "Dinner", "Snacks", "Pre-workout", "Post-workout"];

  return (
    <Card dark={dark}>
      <div className="flex items-center justify-between mb-3">
        <p className={dark ? "text-white font-semibold" : "text-black font-semibold"}>My Meals</p>
        <button onClick={onCreateNew} className={dark ? "text-white/60 text-xs font-semibold flex items-center gap-1" : "text-black/60 text-xs font-semibold flex items-center gap-1"}>
          <Plus size={13} /> New
        </button>
      </div>

      {meals.length === 0 ? (
        <p className={dark ? "text-white/30 text-sm" : "text-black/30 text-sm"}>Save meals you eat often for one-tap logging.</p>
      ) : (
        <div className="space-y-2">
          {meals.map((m) => (
            <div key={m.id} className={dark ? "flex items-center gap-3 bg-white/5 rounded-xl px-3.5 py-2.5" : "flex items-center gap-3 bg-black/5 rounded-xl px-3.5 py-2.5"}>
              {m.photoUrl && (
                <img src={m.photoUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0" onClick={() => setConfirmDelete(m)}>
                <p className={dark ? "text-white text-sm font-medium truncate" : "text-black text-sm font-medium truncate"}>{m.name}</p>
                <p className={dark ? "text-white/40 text-xs" : "text-black/40 text-xs"}>
                  {m.cals} kcal · P{m.protein} C{m.carbs} F{m.fat}
                </p>
              </div>
              <button
                onClick={() => setLogging(m)}
                className={dark ? "w-8 h-8 shrink-0 rounded-full bg-white text-black flex items-center justify-center" : "w-8 h-8 shrink-0 rounded-full bg-black text-white flex items-center justify-center"}
              >
                <Plus size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <BottomSheet dark={dark} open={!!logging} onClose={() => setLogging(null)} title={`Log "${logging?.name}"`}>
        <p className={dark ? "text-white/40 text-sm mb-4" : "text-black/40 text-sm mb-4"}>Add to which meal today?</p>
        <div className="grid grid-cols-2 gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => {
                onLog(logging, c);
                setLogging(null);
              }}
              className={dark ? "bg-white/8 text-white text-sm font-semibold py-3.5 rounded-xl" : "bg-black/8 text-black text-sm font-semibold py-3.5 rounded-xl"}
            >
              {c}
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet dark={dark} open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title={confirmDelete?.name}>
        {confirmDelete && (
          <div>
            <div className="space-y-1.5 mb-4">
              {confirmDelete.ingredients.map((ing, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className={dark ? "text-white/70" : "text-black/70"}>{ing.name}</span>
                  <span className={dark ? "text-white/40" : "text-black/40"}>{ing.cals} kcal</span>
                </div>
              ))}
            </div>
            <DangerButton dark={dark}
              className="w-full"
              onClick={() => {
                onDelete(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              <Trash2 size={14} /> Delete this meal
            </DangerButton>
          </div>
        )}
      </BottomSheet>
    </Card>
  );
}
