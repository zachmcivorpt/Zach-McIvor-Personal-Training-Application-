import React, { useState } from "react";
import { useApp } from "../lib/AppContext";
import { TextInput } from "../components/ui";
import { Plus, ListChecks, Trash2 } from "lucide-react";

export default function CoachHabitLibrary({ showToast }) {
  const { db, createHabitPreset, deleteHabitPreset } = useApp();
  const [label, setLabel] = useState("");
  const presets = db.habitPresets || [];

  function submit(e) {
    e.preventDefault();
    if (!label.trim()) return;
    createHabitPreset(label);
    setLabel("");
    showToast("Habit preset added");
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pb-8 md:px-8">
      <p className="text-black/40 text-sm mb-4">
        {presets.length} preset{presets.length === 1 ? "" : "s"} · suggested when you add daily habits to a client's profile
      </p>

      <form onSubmit={submit} className="flex gap-2 mb-5 md:max-w-md">
        <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Drink 3L of water" className="flex-1" />
        <button type="submit" className="w-11 h-11 shrink-0 rounded-xl bg-black text-white flex items-center justify-center" aria-label="Add habit preset">
          <Plus size={18} />
        </button>
      </form>

      {presets.length === 0 ? (
        <div className="border border-dashed border-black/12 rounded-2xl py-10 text-center">
          <p className="text-black/30 text-sm">No habit presets yet — add your first above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {presets.map((h) => (
            <div key={h.id} className="flex items-center gap-3 bg-black/[0.03] border border-black/8 rounded-xl px-4 py-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                <ListChecks size={14} className="text-blue-500" />
              </div>
              <p className="text-black text-sm font-medium flex-1">{h.label}</p>
              <button
                onClick={() => {
                  deleteHabitPreset(h.id);
                  showToast("Preset removed");
                }}
                className="w-7 h-7 flex items-center justify-center text-black/30 hover:text-black/60"
                aria-label={`Remove ${h.label}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
