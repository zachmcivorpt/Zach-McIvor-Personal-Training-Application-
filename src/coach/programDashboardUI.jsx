// The program-dashboard layout shared by Library → Programs (CoachPrograms)
// and Train Solo → Programs (CoachTrainSolo): a calm program list, a
// detail header carried by large figures, and dropdowns (About, artwork,
// each phase) so the page isn't one long stack of everything at once.
// Coach-only — nothing here is used by the client app or Train Solo's
// customer screens.
import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { MEASURE_BLUE, CLIENT_DARK_BORDER } from "../theme";

// One row in the left-hand program list. The selected program gets a thin
// blue rail and a faint lift instead of a solid blue block.
export function ProgramListItem({ active, title, meta, badge, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`relative w-full text-left pl-4 pr-3 py-3 rounded-xl transition-colors ${active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"}`}
    >
      {active && <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full" style={{ backgroundColor: MEASURE_BLUE }} />}
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm leading-snug line-clamp-2 ${active ? "text-white font-semibold" : "text-white/85 font-medium"}`}>{title}</p>
        {badge}
      </div>
      {meta && <p className="text-white/45 text-xs mt-1 truncate">{meta}</p>}
    </button>
  );
}

// A row of large figures (Phases 3 · Weeks 12 · Sessions 15), divided by
// hairlines rather than boxed.
export function StatFigures({ items }) {
  return (
    <div className="grid border-y py-4 my-5" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, borderColor: CLIENT_DARK_BORDER }}>
      {items.map((it, i) => (
        <div key={it.label} className={`min-w-0 ${i > 0 ? "pl-4 border-l" : ""}`} style={i > 0 ? { borderColor: CLIENT_DARK_BORDER } : undefined}>
          <p className="text-white text-2xl md:text-3xl font-bold tabular-nums leading-none truncate">{it.value}</p>
          <p className="text-white/45 text-[10px] font-bold tracking-[0.14em] uppercase mt-2">{it.label}</p>
        </div>
      ))}
    </div>
  );
}

// A collapsible section: title row with a chevron, content below when open.
export function Disclosure({ title, summary, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b" style={{ borderColor: CLIENT_DARK_BORDER }}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center gap-3 py-3.5 text-left">
        <span className="text-white text-[11px] font-bold tracking-[0.14em] uppercase shrink-0">{title}</span>
        {!open && summary && <span className="text-white/45 text-xs truncate flex-1 min-w-0">{summary}</span>}
        <ChevronDown size={16} className={`text-white/50 ml-auto shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}

// One phase as a dropdown: number, name and length on the row, its
// workouts underneath when open. `menu` is the phase's own ⋮ actions.
export function PhaseAccordionRow({ index, name, meta, open, onToggle, menu, children }) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: open ? "rgba(47,143,255,0.45)" : CLIENT_DARK_BORDER, backgroundColor: "rgba(255,255,255,0.02)" }}>
      <div className="flex items-center gap-2 pr-1.5">
        <button onClick={onToggle} aria-expanded={open} aria-label={`${open ? "Collapse" : "Open"} ${name}`} className="flex-1 min-w-0 flex items-center gap-3.5 pl-4 py-3 text-left">
          <span className="text-white/35 text-lg font-bold tabular-nums w-6 shrink-0">{String(index + 1).padStart(2, "0")}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-white text-sm font-semibold leading-snug break-words">{name}</span>
            <span className="block text-white/45 text-xs mt-0.5">{meta}</span>
          </span>
          <ChevronDown size={16} className={`text-white/50 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {menu}
      </div>
      {open && (
        <div className="border-t px-4 py-4" style={{ borderColor: CLIENT_DARK_BORDER }}>
          {children}
        </div>
      )}
    </div>
  );
}
