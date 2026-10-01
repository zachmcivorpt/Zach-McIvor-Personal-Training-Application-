import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useApp } from "../lib/AppContext";
import { TextInput, TextArea, Select, ExerciseThumb, FullScreenOverlay } from "../components/ui";
import { X, Plus, GripVertical, Search, Video, Dumbbell, Link2, RefreshCw, Ungroup, Edit3, Play, Hand, Copy, Trash2 } from "lucide-react";
import { ExerciseSheet } from "./CoachExercises";
import { parseVideoUrl } from "../lib/video";
import { matchesSearch } from "../lib/search";

const RIR_OPTIONS = [0, 1, 2, 3, 4, 5];
const REST_PRESETS = [0, 30, 45, 60, 90, 120, 180, 240];
const GROUP_LABELS = { superset: "SUPERSET", circuit: "CIRCUIT" };
const GROUP_ICONS = { superset: Link2, circuit: RefreshCw };
const SECTIONS = [
  { key: "warmup", label: "Warm-up", hint: "Dynamic stretches & activation" },
  { key: "main", label: "Main Session", hint: "" },
  { key: "cooldown", label: "Cool-down", hint: "Static stretches" },
];

function formatRest(seconds) {
  if (seconds === 0) return "None";
  if (seconds >= 60) {
    const min = seconds / 60;
    return `${min} min`;
  }
  return `${seconds} sec`;
}

// Every row (exercise or rest) needs an id distinct from exerciseId — the
// same exercise legitimately appears twice in one session (e.g. as both a
// warm-up and a main-session set, or via "duplicate"), so exerciseId alone
// can't tell two rows apart. Before this, the only thing distinguishing two
// rows was their position in the array, which React was also using as the
// list key (key={i}) — reordering rows (drag) then reused the same key for
// a *different* row's data, which let per-row-instance state (a video
// player's own open/closed state, inside ExerciseThumb) stick to the wrong
// row after a drag. crypto.randomUUID() is universal in the browsers this
// PWA targets; the fallback only matters for an unusual runtime that lacks it.
function makeRowId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `row_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function newRow(exerciseId, section = "main") {
  return {
    rowId: makeRowId(),
    exerciseId,
    section,
    targetSets: 3,
    targetReps: 10,
    targetType: "reps",
    targetRIR: 2,
    restSeconds: 90,
    notes: "",
    dropSet: false,
    groupId: null,
    groupType: null,
    // When this exercise entered the program — used to flag exercises
    // that have sat unchanged for a long stretch (see staleExerciseWeeks
    // in CoachClientDetail.jsx). Meaningless on master library templates,
    // but stamped everywhere newRow() is used for consistency.
    addedAt: Date.now(),
  };
}

// A standalone rest marker between exercises — no exerciseId/sets/reps,
// just a rest period. Every consumer of a day's `exercises` array that
// counts exercises or sums duration must skip these (see countExercises
// above); anything that only reads a specific exercise by id already
// ignores rows with no exerciseId and is unaffected.
function newRestRow(section = "main") {
  return { rowId: makeRowId(), isRest: true, section, restSeconds: 90 };
}

// Rows saved before rowId existed (any workout saved before this fix)
// won't have one — stamp it on load rather than requiring a data
// migration. Stable for the lifetime of this editor session since it's
// only computed once, in useState's lazy initializer.
function withRowIds(rows) {
  return (rows || []).map((row) => (row.rowId ? row : { ...row, rowId: makeRowId() }));
}

// Full-screen desktop editor for one workout (a "day"): instructions +
// an exercise table on the left, a searchable exercise picker on the right.
// Used both for a client's own phase workouts and the shared program
// template library, so sets/reps/RIR/rest/notes only need building once.
// `showDate` adds a calendar-date field (used for a client's "workout of
// the day"): the picked date is included in onSave's payload as `date`,
// and `dateHint(date)` can return a short warning shown under it (e.g.
// that the date already has another workout scheduled).
export default function WorkoutEditor({ open, day, exercises, onClose, onSave, showToast, showDate = false, dateHint }) {
  const { createExercise } = useApp();
  const [label, setLabel] = useState(day?.label || "");
  const [date, setDate] = useState(day?.date || "");
  const [instructions, setInstructions] = useState(day?.instructions || "");
  const [muscleGroups, setMuscleGroups] = useState((day?.muscleGroups || []).join(", "));
  const [rows, setRows] = useState(() => withRowIds(day?.exercises));
  const [search, setSearch] = useState("");
  const [addCustomOpen, setAddCustomOpen] = useState(false);
  const [customForm, setCustomForm] = useState({ name: "", category: "", equipment: "Barbell" });
  const [dragIndex, setDragIndex] = useState(null);
  const [draggingExerciseId, setDraggingExerciseId] = useState(null); // exercise being dragged in from the picker, or null
  const [dragPos, setDragPos] = useState(null); // { x, y } — pointer position while either drag is live, drives the floating ghost
  const [selected, setSelected] = useState(() => new Set());
  const [mobilePanel, setMobilePanel] = useState("editor"); // "editor" | "picker" — mobile-only tab switch
  const [addSection, setAddSection] = useState("main"); // which section new exercises from the picker land in
  const [editingExercise, setEditingExercise] = useState(null); // exercise being edited inline (name/video/etc.)
  const [saving, setSaving] = useState(false); // true while the in-flight save() write hasn't resolved yet
  // While an exercise is being reordered, every row collapses to a compact
  // one-line bar — on a phone a full exercise card is nearly a screen tall,
  // so dragging one past others meant dragging blind across several
  // screens. Compact, the whole workout fits on screen at once.
  const [compact, setCompact] = useState(false);
  // Refs backing the two hold-then-drag gestures (row reorder + picker
  // insert) and their shared auto-scroll — declared unconditionally here,
  // above the `if (!open) return null` below, since this component stays
  // mounted with `open` toggling true/false rather than being remounted
  // per use; a hook declared only on the `open === true` branch would shift
  // React's hook call order between renders.
  const leftPaneRef = useRef(null);
  // The floating ghost's position is driven imperatively through this ref
  // (direct style mutation), not through React state — a real drag fires
  // pointermove far faster than this editor's tree (the whole session list
  // plus every picker card's thumbnail) can usefully re-render, and doing
  // setState on each one was the actual cause of the choppy/laggy feel:
  // every pixel of finger movement was forcing a full re-render of a
  // large, image-heavy component tree.
  const ghostRef = useRef(null);
  const lastPointerXRef = useRef(0);
  const lastPointerYRef = useRef(0);
  // Everything about the live drag lives in this one ref and is applied to
  // the DOM directly each animation frame — rows sliding out of the way,
  // the lifted copy following the finger, auto-scroll — so a drag never
  // re-renders this (large, image-heavy) editor until the drop itself.
  const dragRef = useRef(null);
  const autoScrollRafRef = useRef(null);
  const gripPressRef = useRef(null); // { timer, startX, startY, index, fired }
  const pickerPressRef = useRef(null); // { timer, startX, startY, exerciseId, fired }
  const suppressPickerClickRef = useRef(false);

  // Positions the picker's floating pill the instant it mounts (before
  // paint) — every frame after that is handled by the rAF loop below.
  useLayoutEffect(() => {
    if (ghostRef.current && dragPos) {
      ghostRef.current.style.left = `${dragPos.x}px`;
      ghostRef.current.style.top = `${dragPos.y}px`;
    }
  }, [dragPos]);

  /* --------------------------------------------------------------------
     DRAG ENGINE
     Reorder: press the grip and move — the row lifts out (a copy follows
     your finger) and the rows around it slide apart live to show exactly
     where it will land. Insert from the picker: hold a card, drag it over
     the session list, and a gap opens at the drop spot.

     Positions are measured once at pickup (in the scroll pane's content
     coordinates) and the slot is worked out from those, so the sliding
     rows never feed back into the maths. Sections (warm-up / main / cool
     down) render in their own blocks, so everything works in on-screen
     order, and section headers slide along with the rows.
  -------------------------------------------------------------------- */
  function measureItems() {
    const pane = leftPaneRef.current;
    if (!pane) return [];
    const paneTop = pane.getBoundingClientRect().top - pane.scrollTop;
    return [...pane.querySelectorAll("[data-row-index],[data-drag-shift]")]
      .map((el) => {
        const r = el.getBoundingClientRect();
        const idx = el.getAttribute("data-row-index");
        return {
          el,
          index: idx == null ? null : Number(idx),
          section: el.getAttribute("data-section") || "main",
          top: r.top - paneTop,
          height: r.height,
          shift: 0,
        };
      })
      .sort((a, b) => a.top - b.top);
  }

  // Which slot the pointer is over, from the pickup-time layout.
  function computeSlot(d, contentY) {
    const cands = d.items.filter((it) => it.index !== null && it.index !== d.fromIndex);
    let k = 0;
    while (k < cands.length && cands[k].top + cands[k].height / 2 < contentY) k++;
    const prev = cands[k - 1] || null;
    const next = cands[k] || null;
    // Between two sections, the drop joins whichever neighbour the pointer
    // is closer to — so the end of warm-up and the start of main are both
    // reachable.
    let joinPrev = !next;
    if (prev && next && prev.section !== next.section) {
      joinPrev = contentY - (prev.top + prev.height) < next.top - contentY;
    }
    if (!prev && !next) return { mode: "end", boundary: Infinity, section: d.ownSection || addSection };
    if (joinPrev) return { mode: "after", afterIndex: prev.index, boundary: prev.top + prev.height + 0.5, section: prev.section };
    return { mode: "before", beforeIndex: next.index, boundary: next.top, section: next.section };
  }

  function applyShifts(d, slot) {
    for (const it of d.items) {
      if (it.index !== null && it.index === d.fromIndex) continue;
      let shift = 0;
      if (slot) {
        if (d.kind === "row") {
          if (slot.boundary > d.fromTop) shift = it.top > d.fromTop && it.top < slot.boundary ? -d.gapH : 0;
          else shift = it.top >= slot.boundary && it.top < d.fromTop ? d.gapH : 0;
        } else {
          shift = it.top >= slot.boundary ? d.gapH : 0;
        }
      }
      if (shift !== it.shift) {
        it.shift = shift;
        it.el.style.transform = shift ? `translate3d(0, ${shift}px, 0)` : "";
      }
    }
  }

  function beginDrag(d) {
    d.items = measureItems();
    for (const it of d.items) {
      it.el.style.transition = "transform 180ms cubic-bezier(0.2, 0, 0, 1)";
      it.el.style.willChange = "transform";
    }
    // iOS decides whether a touch scrolls when it STARTS, so toggling
    // touch-action mid-gesture isn't enough — a non-passive touchmove
    // blocker is the only thing that reliably stops the page scrolling
    // underneath an active drag.
    d.blockScroll = (ev) => ev.cancelable && ev.preventDefault();
    document.addEventListener("touchmove", d.blockScroll, { passive: false });
    dragRef.current = d;
    startDragLoop();
  }

  function startDragLoop() {
    if (autoScrollRafRef.current) return;
    const EDGE = 56;
    const step = () => {
      const d = dragRef.current;
      if (!d) {
        autoScrollRafRef.current = null;
        return;
      }
      const x = lastPointerXRef.current;
      const y = lastPointerYRef.current;

      if (d.kind === "row" && d.ghost) {
        // Locked to vertical movement — it's a list, not a canvas.
        d.ghost.style.transform = `translate3d(0, ${y - d.startY}px, 0) scale(1.02)`;
      } else if (ghostRef.current) {
        ghostRef.current.style.left = `${x}px`;
        ghostRef.current.style.top = `${y}px`;
      }

      const pane = leftPaneRef.current;
      if (pane) {
        const rect = pane.getBoundingClientRect();
        // Auto-scroll near the top/bottom edge, faster the closer you get.
        if (y < rect.top + EDGE && y >= rect.top - 40) pane.scrollTop -= Math.ceil((EDGE - (y - rect.top)) / 5);
        else if (y > rect.bottom - EDGE && y <= rect.bottom + 40) pane.scrollTop += Math.ceil((EDGE - (rect.bottom - y)) / 5);

        const overPane = x >= rect.left && x <= rect.right && y >= rect.top - 40 && y <= rect.bottom + 40;
        const slot = d.kind === "row" || overPane ? computeSlot(d, y - rect.top + pane.scrollTop) : null;
        d.slot = slot;
        applyShifts(d, slot);
      }
      autoScrollRafRef.current = requestAnimationFrame(step);
    };
    autoScrollRafRef.current = requestAnimationFrame(step);
  }

  // Tears down everything the drag put on the DOM. Called right before the
  // drop's state update, so React renders the new order in the same frame
  // the rows snap back — no flicker.
  function endDrag() {
    const d = dragRef.current;
    if (autoScrollRafRef.current) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
    if (d) {
      for (const it of d.items || []) {
        it.el.style.transition = "";
        it.el.style.transform = "";
        it.el.style.willChange = "";
      }
      d.ghost?.remove();
      if (d.blockScroll) document.removeEventListener("touchmove", d.blockScroll);
      if (d.sourceEl) d.sourceEl.style.visibility = "";
    }
    dragRef.current = null;
    return d;
  }

  // Safety net: if iOS ever swallows the end of a touch mid-drag (a system
  // gesture, a callout) and never sends pointerup/pointercancel, the very
  // next tap anywhere clears it instead of leaving the editor frozen.
  useEffect(() => {
    if (dragIndex === null && draggingExerciseId === null) return;
    function recover() {
      endDrag();
      setCompact(false);
      setDragIndex(null);
      setDraggingExerciseId(null);
      setDragPos(null);
      gripPressRef.current = null;
      pickerPressRef.current = null;
    }
    document.addEventListener("pointerdown", recover, true);
    return () => document.removeEventListener("pointerdown", recover, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragIndex, draggingExerciseId]);

  // Make sure nothing is left behind if the editor closes mid-drag.
  useEffect(() => () => endDrag(), []);

  const exercisesById = useMemo(() => Object.fromEntries(exercises.map((e) => [e.id, e])), [exercises]);
  const filtered = useMemo(
    () =>
      exercises
        .filter((e) => matchesSearch(e.name, search) || matchesSearch(e.category, search))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [exercises, search]
  );

  if (!open) return null;

  function updateRow(i, patch) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function removeRows(indices) {
    const toRemove = new Set(indices);
    setRows((r) => r.filter((_, idx) => !toRemove.has(idx)));
    setSelected(new Set());
  }
  function duplicateRows(indices) {
    const sorted = [...indices].sort((a, b) => a - b);
    if (sorted.length === 0) return;
    setRows((r) => {
      const insertAt = sorted[sorted.length - 1] + 1;
      const clones = sorted.map((i) => ({ ...r[i], rowId: makeRowId(), groupId: null, groupType: null }));
      return [...r.slice(0, insertAt), ...clones, ...r.slice(insertAt)];
    });
    setSelected(new Set());
  }
  function addRest() {
    setRows((r) => {
      const insertAt = selected.size > 0 ? Math.max(...selected) + 1 : r.length;
      return [...r.slice(0, insertAt), newRestRow(addSection), ...r.slice(insertAt)];
    });
  }
  // Where in the rows array a slot lands, once `fromIndex` (the row being
  // moved, if any) has been taken out.
  function slotToArrayIndex(slot, fromIndex, length) {
    const adj = (i) => (fromIndex != null && i > fromIndex ? i - 1 : i);
    if (slot.mode === "before") return adj(slot.beforeIndex);
    if (slot.mode === "after") return adj(slot.afterIndex) + 1;
    return length;
  }

  // Reorder grip. The grip itself never scrolls (touch-action: none), so
  // there's no hold delay — it picks up as soon as the finger moves a few
  // pixels, and the pointer is captured on press so a fast flick can't
  // slip off the small handle and get lost.
  function gripPointerDown(e, i) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    const endAnywhere = () => gripPointerUp();
    window.addEventListener("pointerup", endAnywhere, true);
    window.addEventListener("pointercancel", endAnywhere, true);
    gripPressRef.current = {
      cleanup: () => {
        window.removeEventListener("pointerup", endAnywhere, true);
        window.removeEventListener("pointercancel", endAnywhere, true);
      },
      index: i,
      startX: e.clientX,
      startY: e.clientY,
      handleEl: e.currentTarget,
      fired: false,
    };
  }
  function gripPointerMove(e) {
    const p = gripPressRef.current;
    if (!p) return;
    lastPointerXRef.current = e.clientX;
    lastPointerYRef.current = e.clientY;
    if (p.fired) return;
    if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < 4) return;
    p.fired = true;

    const pane = leftPaneRef.current;
    if (!pane) return;
    const fingerY = e.clientY;
    const movedRowId = rows[p.index]?.rowId;

    // Collapse the list synchronously, then scroll so the picked-up row
    // sits right under the finger — it never jumps away from your thumb.
    flushSync(() => {
      setCompact(true);
      setDragIndex(p.index);
    });
    let rowEl = pane.querySelector(`[data-row-id="${movedRowId}"]`);
    if (!rowEl) return;
    let rect = rowEl.getBoundingClientRect();
    pane.scrollTop += rect.top + rect.height / 2 - fingerY;
    rect = rowEl.getBoundingClientRect();
    const paneTop = pane.getBoundingClientRect().top - pane.scrollTop;

    // The lifted copy that follows the finger.
    const ghost = rowEl.cloneNode(true);
    ghost.removeAttribute("data-row-index");
    ghost.removeAttribute("data-row-id");
    // Centred on the finger — at the very top/bottom of a list the pane
    // can't always scroll far enough to bring the row itself there.
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${rect.left}px`,
      top: `${fingerY - rect.height / 2}px`,
      width: `${rect.width}px`,
      margin: "0",
      zIndex: "200",
      pointerEvents: "none",
      borderRadius: "14px",
      boxShadow: "0 18px 40px -12px rgba(0,0,0,0.35), 0 0 0 2px rgba(59,130,246,0.6)",
      transform: "translate3d(0,0,0) scale(1.03)",
    });
    document.body.appendChild(ghost);
    rowEl.style.visibility = "hidden"; // its space becomes the moving gap

    // Gap = the row's height plus the spacing to its neighbour.
    let spacing = 8;
    const sib = rowEl.nextElementSibling || rowEl.previousElementSibling;
    if (sib) {
      const sr = sib.getBoundingClientRect();
      spacing = sr.top > rect.bottom ? sr.top - rect.bottom : rect.top - sr.bottom;
      if (!(spacing >= 0 && spacing < 40)) spacing = 8;
    }

    if (navigator.vibrate) navigator.vibrate(8);
    lastPointerYRef.current = fingerY;
    beginDrag({
      kind: "row",
      fromIndex: p.index,
      fromTop: rect.top - paneTop,
      ownSection: rows[p.index]?.section || "main",
      gapH: rect.height + spacing,
      startY: fingerY,
      ghost,
      sourceEl: rowEl,
      movedRowId,
    });
  }
  // Also wired as onPointerCancel.
  function gripPointerUp() {
    const p = gripPressRef.current;
    gripPressRef.current = null;
    p?.cleanup?.();
    if (!p?.fired) return;
    const d = endDrag();
    const slot = d?.slot;
    if (slot) {
      setRows((r) => {
        const from = p.index;
        if (!r[from]) return r;
        const moved = r[from];
        const next = r.filter((_, idx) => idx !== from);
        const at = Math.max(0, Math.min(next.length, slotToArrayIndex(slot, from, r.length - 1)));
        next.splice(at, 0, { ...moved, section: slot.section || moved.section });
        return next;
      });
      setSelected(new Set());
    }
    setDragIndex(null);
    setCompact(false);
    // After the full cards are back, keep the exercise you just moved on
    // screen rather than leaving you wherever the expanded list ends up.
    const movedId = d?.movedRowId;
    requestAnimationFrame(() => {
      const el = movedId && leftPaneRef.current?.querySelector(`[data-row-id="${movedId}"]`);
      el?.scrollIntoView({ block: "center" });
    });
  }
  function toggleSelected(i) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }
  function toggleSelectAll(indices) {
    setSelected((s) => (indices.length > 0 && indices.every((i) => s.has(i)) ? new Set() : new Set(indices)));
  }
  function groupSelected(type) {
    const indexSet = new Set([...selected].filter((i) => !rows[i]?.isRest));
    const indices = [...indexSet].sort((a, b) => a - b);
    if (indices.length < 2) return;
    const groupId = `grp_${Date.now()}`;
    setRows((r) => {
      // move every selected row to be contiguous, right after the first one
      const chosen = indices.map((i) => r[i]);
      const rest = r.filter((_, i) => !indexSet.has(i));
      const insertAt = indices[0];
      const next = [...rest.slice(0, insertAt), ...chosen.map((row) => ({ ...row, groupId, groupType: type })), ...rest.slice(insertAt)];
      return next;
    });
    setSelected(new Set());
  }
  function ungroup(groupId) {
    setRows((r) => r.map((row) => (row.groupId === groupId ? { ...row, groupId: null, groupType: null } : row)));
  }
  function addExercise(exerciseId) {
    setRows((r) => [...r, newRow(exerciseId, addSection)]);
    setMobilePanel("editor");
  }
  // Same hold-then-drag pattern as the row-reorder grip handle, applied to
  // a whole exercise card in the picker — a plain tap still adds it to the
  // end of whichever section is selected under "ADDING TO" (the existing
  // onClick), while a brief hold and drag onto a specific row in the
  // session list drops it in right there instead.
  function pickerPointerDown(e, exerciseId) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    // Mouse can capture straight away (no scrolling to protect); touch has
    // to wait out the hold so a normal swipe still scrolls the picker.
    if (e.pointerType === "mouse") {
      try {
        el.setPointerCapture(pointerId);
      } catch {}
    }
    const timer = setTimeout(() => {
      const p = pickerPressRef.current;
      if (!p) return;
      p.fired = true;
      lastPointerXRef.current = p.lastX ?? startX;
      lastPointerYRef.current = p.lastY ?? startY;
      try {
        el.setPointerCapture(pointerId);
      } catch {}
      if (navigator.vibrate) navigator.vibrate(8);
      setDraggingExerciseId(exerciseId);
      setDragPos({ x: lastPointerXRef.current, y: lastPointerYRef.current });
      beginDrag({ kind: "picker", fromIndex: null, gapH: 72, exerciseId });
    }, e.pointerType === "mouse" ? 120 : 220);
    pickerPressRef.current = { timer, startX, startY, exerciseId, fired: false, mouse: e.pointerType === "mouse" };
  }
  function pickerPointerMove(e) {
    const p = pickerPressRef.current;
    if (!p) return;
    p.lastX = e.clientX;
    p.lastY = e.clientY;
    if (!p.fired) {
      // Mouse: moving starts the drag right away. Touch: moving before the
      // hold completes means "scroll", so back off.
      const dist = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
      if (p.mouse && dist > 5) {
        clearTimeout(p.timer);
        p.fired = true;
        lastPointerXRef.current = e.clientX;
        lastPointerYRef.current = e.clientY;
        setDraggingExerciseId(p.exerciseId);
        setDragPos({ x: e.clientX, y: e.clientY });
        beginDrag({ kind: "picker", fromIndex: null, gapH: 72, exerciseId: p.exerciseId });
      } else if (!p.mouse && dist > 12) {
        clearTimeout(p.timer);
        pickerPressRef.current = null;
      }
      return;
    }
    lastPointerXRef.current = e.clientX;
    lastPointerYRef.current = e.clientY;
  }
  function pickerPointerUp() {
    const p = pickerPressRef.current;
    pickerPressRef.current = null;
    if (p?.timer) clearTimeout(p.timer);
    if (p?.fired) {
      suppressPickerClickRef.current = true;
      const d = endDrag();
      const slot = d?.slot;
      if (slot) {
        setRows((r) => {
          const at = Math.max(0, Math.min(r.length, slotToArrayIndex(slot, null, r.length)));
          return [...r.slice(0, at), newRow(p.exerciseId, slot.section || addSection), ...r.slice(at)];
        });
      }
    }
    setDraggingExerciseId(null);
    setDragPos(null);
  }
  function pickerCardClick(exerciseId) {
    if (suppressPickerClickRef.current) {
      suppressPickerClickRef.current = false;
      return;
    }
    addExercise(exerciseId);
  }
  async function addCustomExercise() {
    if (!customForm.name.trim()) return;
    try {
      const ex = await createExercise({
        name: customForm.name.trim(),
        category: customForm.category.trim() || "Custom",
        equipment: customForm.equipment,
        difficulty: "Intermediate",
        primaryMuscles: [],
      });
      addExercise(ex.id);
      setCustomForm({ name: "", category: "", equipment: "Barbell" });
      setAddCustomOpen(false);
    } catch (err) {
      showToast?.(err.message || "Couldn't add that exercise");
    }
  }
  // onSave is async at every call site (it writes to Firestore) — awaiting
  // it here and disabling the button while it's in flight stops a double
  // tap from firing two overlapping saves, and — since every call site now
  // only closes/toasts success after its own write actually resolves —
  // this button staying on "SAVING…" is the coach's only signal that nothing
  // has been confirmed yet. A caller that throws leaves the editor open
  // with the coach's exercises intact rather than losing them.
  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      if (showDate && !date) {
        showToast?.("Pick a date for this workout");
        return;
      }
      await onSave({
        ...day,
        ...(showDate ? { date } : {}),
        label: label.trim() || "Untitled workout",
        instructions,
        muscleGroups: muscleGroups.split(",").map((s) => s.trim()).filter(Boolean),
        exercises: rows,
      });
    } finally {
      setSaving(false);
    }
  }

  const allIndices = rows.map((_, i) => i);
  const allChecked = rows.length > 0 && rows.every((_, i) => selected.has(i));
  // While either drag gesture is live (reordering a row, or dragging a card in
  // from the picker), block native touch-scrolling on BOTH scrollable panes —
  // not just the element under the finger. Pointer capture keeps events routed
  // to the drag's origin element regardless of which pane the finger is over,
  // but the other pane's own touch-action stays "auto" the whole time, so iOS
  // still tries to start its own scroll gesture there at the same time. That
  // fight between a captured pointer and a competing native scroll is what
  // froze the page — the fix is to take scrolling off the table everywhere
  // for the duration of the drag, not just on the dragged card itself.
  const isDragging = dragIndex !== null || draggingExerciseId !== null;

  return (
    <FullScreenOverlay>
    <div className="fixed inset-0 z-[95] bg-white flex flex-col">
      {/* top bar */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3.5 border-b border-black/8 shrink-0 gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
          <span className="hidden sm:inline text-black/40 text-sm font-medium shrink-0">Workout:</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Workout name"
            className="bg-transparent outline-none text-black font-bold text-base md:text-lg min-w-0 flex-1 border-b border-transparent focus:border-black/20"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={save}
            disabled={saving}
            className="bg-black text-white text-sm font-bold px-4 md:px-5 py-2.5 rounded-xl disabled:opacity-50"
          >
            {saving ? "SAVING…" : "SAVE"}
          </button>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-black/8 text-black/60">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* mobile panel switch */}
      <div className="md:hidden flex gap-2 px-4 py-2.5 border-b border-black/8 shrink-0">
        <button
          onClick={() => setMobilePanel("editor")}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold ${mobilePanel === "editor" ? "bg-black text-white" : "bg-black/8 text-black/60"}`}
        >
          Editor {rows.length > 0 && `(${rows.length})`}
        </button>
        <button
          onClick={() => setMobilePanel("picker")}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold ${mobilePanel === "picker" ? "bg-black text-white" : "bg-black/8 text-black/60"}`}
        >
          Add Exercises
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* left: instructions + exercise table */}
        <div
          ref={leftPaneRef}
          className={`${
            mobilePanel === "picker" ? "hidden" : "flex-1"
          } md:block md:flex-1 overflow-y-auto px-4 md:px-6 py-5 md:border-r border-black/8`}
          style={isDragging ? { touchAction: "none" } : undefined}
        >
          {showDate && (
            <div className="mb-4">
              <p className="text-black/40 text-[11px] font-semibold tracking-wide mb-2">DATE</p>
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} className="text-sm" />
              {dateHint?.(date) && <p className="text-orange-600 text-xs mt-1.5 leading-snug">{dateHint(date)}</p>}
            </div>
          )}
          <p className="text-black/40 text-[11px] font-semibold tracking-wide mb-2">INSTRUCTIONS</p>
          <TextArea
            rows={2}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="(Optional) A short summary of this workout or general cues, e.g. rest times / overall focus for the client."
            className="mb-3"
          />
          <TextInput
            value={muscleGroups}
            onChange={(e) => setMuscleGroups(e.target.value)}
            placeholder="Muscle groups (comma separated) — e.g. Chest, Shoulders, Triceps"
            className="text-sm mb-6"
          />

          <p className="text-black/40 text-[11px] font-semibold tracking-wide mb-2">
            EXERCISES {rows.length > 0 && `(${rows.length})`}
          </p>

          {/* toolbar: select-all, superset/circuit grouping, duplicate/delete, add rest */}
          {rows.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={() => toggleSelectAll(allIndices)}
                className="w-4 h-4 accent-black shrink-0 mr-1"
                aria-label="Select all rows"
              />
              <button
                onClick={() => groupSelected("superset")}
                disabled={selected.size < 2}
                className="flex items-center gap-1 bg-black/8 hover:bg-black/15 text-black/70 text-[11px] font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-30"
              >
                <Link2 size={11} /> SUPERSET
              </button>
              <button
                onClick={() => groupSelected("circuit")}
                disabled={selected.size < 2}
                className="flex items-center gap-1 bg-black/8 hover:bg-black/15 text-black/70 text-[11px] font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-30"
              >
                <RefreshCw size={11} /> CIRCUIT
              </button>
              <button
                onClick={() => duplicateRows([...selected])}
                disabled={selected.size === 0}
                className="w-7 h-7 flex items-center justify-center text-black/50 hover:text-black rounded-lg hover:bg-black/8 disabled:opacity-30"
                aria-label="Duplicate selected"
              >
                <Copy size={13} />
              </button>
              <button
                onClick={() => removeRows([...selected])}
                disabled={selected.size === 0}
                className="w-7 h-7 flex items-center justify-center text-black/50 hover:text-red-500 rounded-lg hover:bg-red-50 disabled:opacity-30"
                aria-label="Delete selected"
              >
                <Trash2 size={13} />
              </button>
              <button
                onClick={addRest}
                className="ml-auto flex items-center gap-1.5 bg-black text-white text-[11px] font-bold px-3 py-1.5 rounded-lg"
              >
                <Hand size={12} /> ADD REST
              </button>
            </div>
          )}

          {rows.length === 0 ? (
            <div className="border border-dashed border-black/12 rounded-2xl py-10 text-center">
              <p className="text-black/30 text-sm mb-3">No exercises yet — add some from the library on the right.</p>
              <button onClick={addRest} className="inline-flex items-center gap-1.5 bg-black/8 text-black/60 text-xs font-bold px-3 py-1.5 rounded-lg">
                <Hand size={12} /> ADD REST
              </button>
            </div>
          ) : (
            <>
              {/* column header, desktop only */}
              <div className="hidden md:grid grid-cols-[20px_2.2fr_56px_200px_0.85fr_92px_20px] gap-3 px-2 mb-1.5">
                <span className="col-span-2 text-black/30 text-[10px] font-bold tracking-wide">EXERCISE NAME</span>
                <span className="text-black/30 text-[10px] font-bold tracking-wide text-center">SETS</span>
                <span className="text-black/30 text-[10px] font-bold tracking-wide">TARGET</span>
                <span className="text-black/30 text-[10px] font-bold tracking-wide">NOTES</span>
                <span className="text-black/30 text-[10px] font-bold tracking-wide text-center">REST PERIOD</span>
                <span />
              </div>

              {SECTIONS.map((section) => {
                const sectionRows = rows.map((row, i) => ({ row, i })).filter(({ row }) => (row.section || "main") === section.key);
                if (rows.length > 0 && sectionRows.length === 0 && section.key !== "main") return null;
                return (
                  <div key={section.key} className="mb-6">
                    {rows.some((r) => (r.section || "main") !== "main") && (
                      <div data-drag-shift className="flex items-center justify-between mb-2">
                        <p className="text-black/40 text-[11px] font-bold tracking-wide">
                          {section.label.toUpperCase()} {sectionRows.length > 0 && `(${sectionRows.length})`}
                        </p>
                        {section.hint && <p className="text-black/25 text-[10px]">{section.hint}</p>}
                      </div>
                    )}
                    {sectionRows.length === 0 ? (
                      rows.some((r) => (r.section || "main") !== "main") && (
                        <p className="text-black/25 text-xs mb-2">No {section.label.toLowerCase()} exercises yet.</p>
                      )
                    ) : (
                      <div className="space-y-2 md:space-y-0.5">
                        {sectionRows.map(({ row, i }) => {
                          const ex = row.isRest ? null : exercisesById[row.exerciseId];
                          const GroupIcon = row.groupType ? GROUP_ICONS[row.groupType] : null;
                          return (
                            <div key={row.rowId} data-row-index={i} data-row-id={row.rowId} data-section={row.section || "main"}>
                              {compact && (
                                <div
                                  className={`select-none flex items-center gap-3 rounded-xl border px-3 py-2 ${
                                    row.isRest ? "bg-orange-50 border-orange-200" : "bg-white border-black/10"
                                  }`}
                                >
                                  <GripVertical size={18} className="text-black/35 shrink-0" />
                                  {row.isRest ? (
                                    <div className="w-9 h-9 rounded-lg bg-orange-400 flex items-center justify-center shrink-0">
                                      <Hand size={14} className="text-white" />
                                    </div>
                                  ) : (
                                    <ExerciseThumb exercise={ex} size={36} rounded="rounded-lg" />
                                  )}
                                  <p className="text-black font-semibold text-sm truncate flex-1 min-w-0">
                                    {row.isRest ? `Rest · ${formatRest(row.restSeconds ?? 90)}` : ex?.name || "Unknown exercise"}
                                  </p>
                                  {!row.isRest && (
                                    <span className="text-black/35 text-xs shrink-0">
                                      {row.targetSets ?? 3} × {row.targetReps ?? 10}
                                    </span>
                                  )}
                                </div>
                              )}
                              {/* Full card stays mounted (just hidden) in compact mode — the
                                  grip being held lives in here, and unmounting it mid-drag
                                  made the browser lose the finger entirely. */}
                              <div className={compact ? "hidden" : undefined}>
                              {row.groupType && (
                                <div className="flex items-center gap-1.5 mt-2 mb-1">
                                  <GroupIcon size={11} className="text-black/50" />
                                  <span className="text-black/50 text-[10px] font-bold tracking-wide">{GROUP_LABELS[row.groupType]}</span>
                                  <button onClick={() => ungroup(row.groupId)} className="text-black/30 hover:text-black/60 flex items-center gap-0.5 text-[10px]">
                                    <Ungroup size={11} /> Ungroup
                                  </button>
                                </div>
                              )}

                              {row.isRest ? (
                                <div
                                  className={`select-none flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                                    "bg-amber-50 border border-amber-200/70"
                                  }`}
                                  style={{ WebkitTouchCallout: "none" }}
                                >
                                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggleSelected(i)} className="w-4 h-4 shrink-0 accent-black" />
                                  <div className="w-7 h-7 rounded-lg bg-amber-400 flex items-center justify-center shrink-0">
                                    <Hand size={13} className="text-white" />
                                  </div>
                                  <p className="text-black/60 font-semibold text-sm flex-1">Rest</p>
                                  <select
                                    value={row.restSeconds ?? 90}
                                    onChange={(e) => updateRow(i, { restSeconds: +e.target.value })}
                                    className="bg-white border border-amber-200 rounded-lg text-center text-black text-sm py-1.5 px-2 outline-none w-24 shrink-0"
                                  >
                                    {REST_PRESETS.map((s) => (
                                      <option key={s} value={s}>
                                        {formatRest(s)}
                                      </option>
                                    ))}
                                  </select>
                                  <div
                                    onPointerDown={(e) => gripPointerDown(e, i)}
                                    onPointerMove={gripPointerMove}
                                    onPointerUp={gripPointerUp}
                                    onPointerCancel={gripPointerUp}
                                    style={{ touchAction: "none", WebkitTouchCallout: "none" }}
                                    className="text-black/30 hover:text-black/60 shrink-0 cursor-grab active:cursor-grabbing p-2.5 -m-2.5 rounded-lg active:bg-black/5"
                                  >
                                    <GripVertical size={18} />
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className={`select-none bg-black/[0.03] border rounded-2xl p-3.5 md:rounded-xl md:py-2 md:px-2 transition-colors md:grid md:grid-cols-[20px_2.2fr_56px_200px_0.85fr_92px_20px] md:gap-3 md:items-center ${
                                    "border-black/8"
                                  }`}
                                  style={{ WebkitTouchCallout: "none" }}
                                >
                                  {/* checkbox — own column on desktop, inline on mobile */}
                                  <div className="hidden md:flex items-center justify-center">
                                    <input type="checkbox" checked={selected.has(i)} onChange={() => toggleSelected(i)} className="w-4 h-4 accent-black" />
                                  </div>

                                  {/* name + thumb — on mobile this row also carries its own checkbox/drag/edit;
                                      on desktop those three are hidden here since they get their own grid columns */}
                                  <div className="flex items-center gap-3 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={selected.has(i)}
                                      onChange={() => toggleSelected(i)}
                                      className="w-4 h-4 shrink-0 accent-black md:hidden"
                                    />
                                    <div
                                      onPointerDown={(e) => gripPointerDown(e, i)}
                                      onPointerMove={gripPointerMove}
                                      onPointerUp={gripPointerUp}
                                      onPointerCancel={gripPointerUp}
                                      style={{ touchAction: "none", WebkitTouchCallout: "none" }}
                                      className="text-black/30 hover:text-black/60 shrink-0 cursor-grab active:cursor-grabbing md:hidden p-2.5 -m-2.5 rounded-lg active:bg-black/5"
                                    >
                                      <GripVertical size={18} />
                                    </div>
                                    <ExerciseThumb exercise={ex} size={52} rounded="rounded-lg" />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start gap-1.5">
                                        <p className="text-black font-semibold text-sm leading-snug">{ex?.name || "Unknown exercise"}</p>
                                        {row.dropSet && (
                                          <span className="bg-orange-100 text-orange-600 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                                            DROPSET
                                          </span>
                                        )}
                                      </div>
                                      {ex && <p className="text-black/35 text-[11px] truncate md:hidden">{ex.equipment} · {ex.category}</p>}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setEditingExercise(ex)}
                                      disabled={!ex}
                                      className="w-7 h-7 shrink-0 flex items-center justify-center text-black/30 hover:text-black/60 disabled:opacity-30 md:hidden"
                                      aria-label="Edit this exercise"
                                    >
                                      <Edit3 size={14} />
                                    </button>
                                  </div>

                                  {/* sets */}
                                  <div className="mt-2.5 md:mt-0">
                                    <p className="text-black/30 text-[10px] mb-1 md:hidden">SETS</p>
                                    <input
                                      type="number"
                                      min={1}
                                      value={row.targetSets}
                                      onChange={(e) => updateRow(i, { targetSets: +e.target.value })}
                                      className="w-full bg-white border border-black/10 rounded-lg text-center text-black text-sm py-1.5 outline-none"
                                    />
                                  </div>

                                  {/* target: reps/time toggle + value, single line on desktop, dropset/amrap as compact icon chips */}
                                  <div className="mt-2.5 md:mt-0 flex items-center flex-wrap md:flex-nowrap gap-1">
                                    {/* Segmented REPS/TIME control — both options always shown with
                                        the active one highlighted, rather than a single button whose
                                        label named the OTHER mode (read by more than one coach as the
                                        app having reps/time backwards, since the highlighted-looking
                                        label was actually what you'd switch to, not the current mode). */}
                                    <div className="flex items-center rounded-lg overflow-hidden shrink-0 border border-black/10">
                                      <button
                                        type="button"
                                        onClick={() => updateRow(i, { targetType: "reps", targetReps: 10 })}
                                        className={`text-[9px] font-bold px-1.5 py-[7px] ${
                                          row.targetType === "time" ? "bg-white text-black/35" : "bg-black text-white"
                                        }`}
                                      >
                                        REPS
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => updateRow(i, { targetType: "time", targetReps: 30 })}
                                        className={`text-[9px] font-bold px-1.5 py-[7px] ${
                                          row.targetType === "time" ? "bg-black text-white" : "bg-white text-black/35"
                                        }`}
                                      >
                                        TIME
                                      </button>
                                    </div>
                                    {row.targetType === "time" ? (
                                      <div className="flex items-center gap-0.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => updateRow(i, { targetReps: Math.max(10, (Number(row.targetReps) || 30) - 10) })}
                                          className="w-5 h-[30px] shrink-0 rounded-lg bg-white border border-black/10 text-black/50 text-sm font-bold"
                                        >
                                          −
                                        </button>
                                        <div className="w-11 bg-white border border-black/10 rounded-lg text-center text-black text-xs font-semibold py-1.5">
                                          {row.targetReps || 30}s
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => updateRow(i, { targetReps: (Number(row.targetReps) || 30) + 10 })}
                                          className="w-5 h-[30px] shrink-0 rounded-lg bg-white border border-black/10 text-black/50 text-sm font-bold"
                                        >
                                          +
                                        </button>
                                      </div>
                                    ) : row.targetReps === "AMRAP" ? (
                                      <div className="px-2 bg-white border border-black/10 rounded-lg text-center text-black text-xs font-semibold py-1.5 shrink-0">
                                        AMRAP
                                      </div>
                                    ) : (
                                      <input
                                        type="number"
                                        min={1}
                                        value={row.targetReps}
                                        onChange={(e) => updateRow(i, { targetReps: +e.target.value })}
                                        className="w-10 shrink-0 bg-white border border-black/10 rounded-lg text-center text-black text-sm py-1.5 outline-none"
                                      />
                                    )}
                                    <button
                                      type="button"
                                      title="Drop set"
                                      onClick={() => updateRow(i, { dropSet: !row.dropSet })}
                                      className={`w-5 h-[26px] shrink-0 rounded-lg text-[9px] font-bold flex items-center justify-center ${
                                        row.dropSet ? "bg-orange-500 text-white" : "bg-white border border-black/10 text-black/30"
                                      }`}
                                    >
                                      D
                                    </button>
                                    {row.targetType !== "time" && (
                                      <button
                                        type="button"
                                        title="AMRAP (as many reps as possible)"
                                        onClick={() => updateRow(i, { targetReps: row.targetReps === "AMRAP" ? 10 : "AMRAP" })}
                                        className={`w-5 h-[26px] shrink-0 rounded-lg text-[9px] font-bold flex items-center justify-center ${
                                          row.targetReps === "AMRAP" ? "bg-black text-white" : "bg-white border border-black/10 text-black/30"
                                        }`}
                                      >
                                        A
                                      </button>
                                    )}
                                  </div>

                                  {/* notes / cue */}
                                  <div className="mt-2.5 md:mt-0">
                                    <p className="text-black/30 text-[10px] mb-1 md:hidden">NOTES</p>
                                    <input
                                      value={row.notes || ""}
                                      onChange={(e) => updateRow(i, { notes: e.target.value })}
                                      placeholder="Note / cue..."
                                      className="w-full bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-black text-xs outline-none placeholder:text-black/30"
                                    />
                                  </div>

                                  {/* rest period */}
                                  <div className="mt-2.5 md:mt-0">
                                    <p className="text-black/30 text-[10px] mb-1 md:hidden">REST</p>
                                    <select
                                      value={row.restSeconds ?? 90}
                                      onChange={(e) => updateRow(i, { restSeconds: +e.target.value })}
                                      className="w-full bg-white border border-black/10 rounded-lg text-center text-black text-sm py-1.5 outline-none appearance-none"
                                    >
                                      {REST_PRESETS.map((s) => (
                                        <option key={s} value={s}>
                                          {formatRest(s)}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="mt-2.5 md:hidden">
                                    <p className="text-black/30 text-[10px] mb-1">TARGET RIR (REPS IN RESERVE)</p>
                                    <div className="flex gap-1.5">
                                      {RIR_OPTIONS.map((v) => (
                                        <button
                                          key={v}
                                          onClick={() => updateRow(i, { targetRIR: v })}
                                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
                                            (row.targetRIR ?? 2) === v ? "bg-black text-white" : "bg-black/8 text-black/50"
                                          }`}
                                        >
                                          {v}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* drag handle — desktop only column */}
                                  <div
                                    onPointerDown={(e) => gripPointerDown(e, i)}
                                    onPointerMove={gripPointerMove}
                                    onPointerUp={gripPointerUp}
                                    onPointerCancel={gripPointerUp}
                                    style={{ touchAction: "none", WebkitTouchCallout: "none" }}
                                    className="hidden md:flex items-center justify-center text-black/30 hover:text-black/60 cursor-grab active:cursor-grabbing self-stretch rounded-lg hover:bg-black/5"
                                  >
                                    <GripVertical size={16} />
                                  </div>
                                </div>
                              )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Trailing drop zone below the last row — without it, letting
                  go anywhere past the last exercise (a very natural place to
                  aim for "add to the end") hit no [data-row-index] element
                  at all, so the drag just silently did nothing. Always
                  mounted (sized to 0 when not dragging) rather than
                  conditionally rendered — inserting a whole new element into
                  the page the instant a drag starts, mid-touch, is exactly
                  the kind of layout shift that can make mobile Safari drop
                  the rest of that touch sequence. */}
              <div style={{ minHeight: isDragging ? 96 : 0 }} />
            </>
          )}
        </div>

        {/* right: exercise picker */}
        <div
          className={`${
            mobilePanel === "editor" ? "hidden" : "flex-1"
          } md:block md:flex-none md:w-[380px] shrink-0 overflow-y-auto px-4 md:px-5 py-5`}
          style={isDragging ? { touchAction: "none" } : undefined}
        >
          <div className="flex items-center gap-2 bg-black/5 rounded-xl px-3 py-2.5 mb-3">
            <Search size={15} className="text-black/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for an exercise"
              className="bg-transparent outline-none text-black text-sm flex-1 placeholder:text-black/30"
            />
          </div>

          <div className="mb-3">
            <p className="text-black/30 text-[10px] font-semibold tracking-wide mb-1.5">ADDING TO</p>
            <div className="flex gap-1.5">
              {SECTIONS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setAddSection(s.key)}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold ${
                    addSection === s.key ? "bg-black text-white" : "bg-black/8 text-black/40"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {!addCustomOpen ? (
            <button onClick={() => setAddCustomOpen(true)} className="text-black/60 text-xs font-semibold flex items-center gap-1.5 mb-4">
              <Plus size={13} /> Add custom exercise
            </button>
          ) : (
            <div className="bg-black/[0.03] border border-black/8 rounded-xl p-3 space-y-2 mb-4">
              <TextInput
                value={customForm.name}
                onChange={(e) => setCustomForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Exercise name"
                className="text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <TextInput
                  value={customForm.category}
                  onChange={(e) => setCustomForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="Category"
                  className="text-sm"
                />
                <Select value={customForm.equipment} onChange={(e) => setCustomForm((f) => ({ ...f, equipment: e.target.value }))}>
                  {["Barbell", "Dumbbell", "Cable", "Machine", "Bodyweight", "Kettlebell", "Band"].map((eq) => (
                    <option key={eq}>{eq}</option>
                  ))}
                </Select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setAddCustomOpen(false)} className="flex-1 bg-black/8 text-black text-xs font-semibold py-2 rounded-lg">
                  Cancel
                </button>
                <button onClick={addCustomExercise} className="flex-1 bg-black text-white text-xs font-bold py-2 rounded-lg">
                  Add
                </button>
              </div>
            </div>
          )}

          <p className="text-black/25 text-[10px] mb-2 -mt-1">Tap to add, or hold and drag onto a spot in the session.</p>
          <div className="grid grid-cols-2 gap-2.5">
            {filtered.map((ex) => (
              <div
                key={ex.id}
                onPointerDown={(e) => pickerPointerDown(e, ex.id)}
                onPointerMove={pickerPointerMove}
                onPointerUp={pickerPointerUp}
                onPointerCancel={pickerPointerUp}
                onContextMenu={(e) => e.preventDefault()}
                style={{
                  WebkitTouchCallout: "none",
                  WebkitUserSelect: "none",
                  ...(draggingExerciseId === ex.id ? { touchAction: "none" } : null),
                }}
                className={`relative bg-black/[0.03] hover:bg-black/[0.06] active:bg-black/[0.08] active:scale-[0.97] border rounded-xl p-3 transition-all duration-100 select-none ${
                  draggingExerciseId === ex.id ? "opacity-40 scale-[0.97] border-blue-300" : "border-black/8"
                }`}
              >
                <button type="button" onClick={() => pickerCardClick(ex.id)} className="w-full text-left">
                  <div className="relative w-full aspect-square rounded-lg bg-black/8 overflow-hidden flex items-center justify-center mb-2">
                    {(() => {
                      const parsed = ex.videoUrl ? parseVideoUrl(ex.videoUrl) : null;
                      if (!parsed) return <Dumbbell size={20} className="text-black/35" />;
                      if (parsed.kind === "file") {
                        return (
                          <>
                            <video
                              src={parsed.src}
                              muted
                              playsInline
                              preload="metadata"
                              draggable={false}
                              disableRemotePlayback
                              className="w-full h-full object-cover pointer-events-none"
                            />
                            {/* iOS's long-press "peek" preview + Copy/Save Photos menu on
                                a <video> element is a native gesture recognizer attached
                                below the DOM, so pointer-events/touch-callout on the video
                                itself can't stop it. A plain, fully transparent div on top
                                — an ordinary element with no native video behavior — is
                                what actually intercepts the touch before it reaches the
                                video's native player view. */}
                            <div className="absolute inset-0" />
                          </>
                        );
                      }
                      if (parsed.thumbnail) {
                        return (
                          <>
                            <img
                              src={parsed.thumbnail}
                              alt=""
                              draggable={false}
                              className="w-full h-full object-cover pointer-events-none"
                              style={{ WebkitTouchCallout: "none" }}
                            />
                            <Play size={18} className="absolute text-white drop-shadow" fill="white" />
                            {/* Same touch-catcher as the video thumbnail above — belt
                                and suspenders against any native iOS image callout
                                that -webkit-touch-callout alone doesn't always catch. */}
                            <div className="absolute inset-0" />
                          </>
                        );
                      }
                      return <Video size={20} className="text-black/50" />;
                    })()}
                  </div>
                  <p className="text-black text-xs font-semibold leading-tight line-clamp-2 pr-5">{ex.name}</p>
                  <p className="text-black/35 text-[10px] mt-0.5">{ex.equipment}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingExercise(ex)}
                  className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-white/80 flex items-center justify-center text-black/50 hover:text-black hover:bg-white"
                  aria-label={`View or edit ${ex.name}`}
                >
                  <Edit3 size={12} />
                </button>
              </div>
            ))}
            {filtered.length === 0 && <p className="text-black/30 text-xs col-span-2 text-center py-6">No exercises match.</p>}
          </div>
        </div>
      </div>

      <ExerciseSheet
        exercise={editingExercise}
        open={!!editingExercise}
        onClose={() => setEditingExercise(null)}
        showToast={showToast || (() => {})}
      />

      {/* Floating "ghost" that tracks the finger/cursor once a drag has
          started — without this the dragged row/card just sits there dimmed
          in place, which reads as unresponsive rather than as an active
          drag. pointer-events-none so it never blocks the elementFromPoint()
          lookup that finds the row underneath it. Same pattern as the coach
          calendar's drag-drop. */}
      {dragPos && draggingExerciseId !== null && (
        <div
          ref={ghostRef}
          className="drag-ghost-pop fixed z-[200] pointer-events-none flex items-center gap-2.5 bg-white text-black text-sm font-semibold pl-2 pr-4 py-2 rounded-2xl shadow-2xl ring-2 ring-blue-400 max-w-[240px]"
          style={{ transform: "translate(-50%, -130%)" }}
        >
          <ExerciseThumb exercise={exercisesById[draggingExerciseId]} size={32} rounded="rounded-lg" />
          <span className="truncate">{exercisesById[draggingExerciseId]?.name || "Exercise"}</span>
        </div>
      )}
    </div>
    </FullScreenOverlay>
  );
}
