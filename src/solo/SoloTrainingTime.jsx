import React, { useEffect, useState } from "react";
import { BottomSheet } from "../components/ui";
import { SoloButton, SoloTextButton, SOLO_TYPE } from "./SoloUI";
import { soloClearSheetGlass, CLEAR_SHEET_BACKDROP } from "./SoloThemeContext";
import { TRAINING_TIMES, timeLabel } from "./retention";
import { saveTrainingTime } from "./goalStore";
import { enableSoloPush, hasSoloPushToken } from "../lib/push";
import { inIosApp } from "./appShell";

// Training reminder (#245): "What time do you usually train?" One reminder
// at that time on training days, only if they haven't trained yet
// (functions/soloTrainingReminder.js). Glass sheet like the rest of Solo.
export function TrainingTimeSheet({ open, onClose, uid, current = null, dark, t }) {
  const [time, setTime] = useState(current || "18:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setTime(current || "18:00");
      setError("");
      setBusy(false);
    }
  }, [open, current]);

  async function save(value) {
    if (!uid) return;
    setBusy(true);
    setError("");
    try {
      // A browser has to opt in to notifications once; the iPhone app's token
      // comes from iOS itself.
      if (value && !inIosApp() && !hasSoloPushToken(uid)) await enableSoloPush(uid).catch(() => {});
      await saveTrainingTime(uid, value);
      onClose();
    } catch {
      setError("Couldn't save — please try again.");
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Training reminder" dark={dark} surface={soloClearSheetGlass(dark)} backdropClassName={CLEAR_SHEET_BACKDROP}>
      <div style={{ color: t.text }}>
        <p className={SOLO_TYPE.body} style={{ color: t.textMuted }}>
          What time do you usually train? We'll remind you once on your training days, only if you haven't trained yet.
        </p>
        <div className="grid grid-cols-4 gap-1.5 mt-5" role="radiogroup" aria-label="Training time">
          {TRAINING_TIMES.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={time === v}
              onClick={() => setTime(v)}
              className="h-10 rounded-full text-[12px] font-bold"
              style={time === v ? { backgroundColor: t.text, color: t.bg } : { backgroundColor: t.chipBg, border: `1px solid ${t.panelBorder}`, color: t.textMuted }}
            >
              {timeLabel(v)}
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
        <SoloButton t={t} className="mt-6" onClick={() => save(time)} disabled={busy}>
          {busy ? "Saving…" : `Remind me at ${timeLabel(time)}`}
        </SoloButton>
        <SoloTextButton t={t} className="mt-1" onClick={() => save(null)} disabled={busy}>
          {current ? "Turn reminder off" : "No reminder"}
        </SoloTextButton>
      </div>
    </BottomSheet>
  );
}
