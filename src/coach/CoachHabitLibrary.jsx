import React, { useState } from "react";
import { useApp } from "../lib/AppContext";
import { TextInput } from "../components/ui";
import { DarkPanel } from "./darkUI";
import { MEASURE_BLUE, CLIENT_DARK_BORDER } from "../theme";
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
      <p className="text-white text-sm mb-4">
        {presets.length} preset{presets.length === 1 ? "" : "s"} · suggested when you add daily habits to a client's profile
      </p>

      <form onSubmit={submit} className="flex gap-2 mb-5 md:max-w-md">
        <TextInput dark value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Drink 3L of water" className="flex-1" />
        <button type="submit" className="w-11 h-11 shrink-0 rounded-xl bg-white text-black flex items-center justify-center" aria-label="Add habit preset">
          <Plus size={18} />
        </button>
      </form>

      {presets.length === 0 ? (
        <div className="border border-dashed rounded-2xl py-10 text-center" style={{ borderColor: "rgba(255,255,255,0.14)" }}>
          <p className="text-white text-sm">No habit presets yet — add your first above.</p>
        </div>
      ) : (
        <DarkPanel className="flex flex-col">
          <div className="relative px-5 py-1">
            {presets.map((h) => (
              <div key={h.id} className="flex items-center gap-3 py-3 border-b last:border-0" style={{ borderColor: CLIENT_DARK_BORDER }}>
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border"
                  style={{ backgroundColor: "rgba(47,143,255,0.12)", borderColor: "rgba(47,143,255,0.25)" }}
                >
                  <ListChecks size={14} style={{ color: MEASURE_BLUE }} />
                </div>
                <p className="text-white text-sm font-medium flex-1">{h.label}</p>
                <button
                  onClick={() => {
                    deleteHabitPreset(h.id);
                    showToast("Preset removed");
                  }}
                  className="w-7 h-7 flex items-center justify-center text-white hover:text-white"
                  aria-label={`Remove ${h.label}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </DarkPanel>
      )}
    </div>
  );
}
