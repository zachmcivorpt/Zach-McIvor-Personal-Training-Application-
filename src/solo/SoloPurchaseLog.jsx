import React, { useEffect, useState } from "react";
import { BottomSheet } from "../components/ui";
import { getPurchaseTrace } from "../lib/purchases";
import { useSoloTheme, SOLO_THEMES, soloClearSheetGlass, CLEAR_SHEET_BACKDROP } from "./SoloThemeContext";
import { SOLO_TYPE } from "./SoloUI";

// The iPhone app's record of the last time Apple's purchase or Manage
// Subscriptions sheet was shown (#183, ios PurchasesBridge.swift
// PurchaseTrace): each step of the hand-back with its time, so a white screen
// on a device says exactly which step failed. Test accounts only (Profile).
export default function SoloPurchaseLog({ onClose }) {
  const { dark } = useSoloTheme();
  const t = SOLO_THEMES[dark ? "dark" : "light"];
  const [lines, setLines] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getPurchaseTrace()
      .then((list) => setLines(Array.isArray(list) ? list : []))
      .catch(() => setError("This version of the app doesn't keep a purchase log yet."));
  }, []);

  const text = (lines || []).join("\n");
  function copy() {
    try {
      navigator.clipboard.writeText(text).then(() => setCopied(true), () => setCopied(false));
    } catch {
      setCopied(false);
    }
  }

  return (
    <BottomSheet open onClose={onClose} title="Purchase log" dark={dark} surface={soloClearSheetGlass(dark)} backdropClassName={CLEAR_SHEET_BACKDROP}>
      <div style={{ color: t.text }}>
        <p className={`${SOLO_TYPE.body} mb-3`} style={{ color: t.textMuted }}>
          What the app recorded the last time Apple's purchase or subscription screen was shown. Copy it into your message when reporting a problem.
        </p>
        {error ? (
          <p className={SOLO_TYPE.body}>{error}</p>
        ) : lines === null ? (
          <p className={SOLO_TYPE.body} style={{ color: t.textMuted }}>–</p>
        ) : lines.length === 0 ? (
          <p className={SOLO_TYPE.body}>Nothing recorded yet.</p>
        ) : (
          <>
            <pre data-testid="purchase-log" className="text-[11px] leading-relaxed whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto font-mono">
              {text}
            </pre>
            <button type="button" onClick={copy} className="mt-4 text-xs font-bold tracking-[0.08em] uppercase underline underline-offset-2">
              {copied ? "Copied" : "Copy"}
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
