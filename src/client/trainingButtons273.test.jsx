// @vitest-environment jsdom
// #273 (owner: "make sure all buttons work on these two pages"): every
// button on the client Training tab's Today and Program views, clicked in
// the real WorkoutsScreen with real-shaped data, as View as Client (which
// shows every coach row) and as a real client.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";

vi.setConfig({ testTimeout: 30000 });
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), useLocation: () => ({ pathname: "/" }), Link: ({ children }) => children }));
// The workout editor is a big coach screen of its own; here we only need to
// know the right one opened with the right workout, and that Save reaches
// the save path.
vi.mock("../coach/WorkoutEditor", () => ({
  default: ({ day, onSave, onClose }) => (
    <div data-testid="workout-editor" data-label={day.label} data-exercises={(day.exercises || []).length}>
      <button onClick={() => onSave({ ...day, date: day.date || "2026-11-18" })}>EDITOR SAVE</button>
      <button onClick={onClose}>EDITOR CLOSE</button>
    </div>
  ),
}));
let ctx;
vi.mock("../lib/AppContext", async (orig) => ({ ...(await orig()), useApp: () => ctx }));
window.HTMLElement.prototype.scrollIntoView = () => {};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const pull = { id: "d2", label: "Pull Day", muscleGroups: ["Lats"], exercises: [{ id: "e1", exerciseId: "x1", targetSets: 2 }] };
const push = { id: "d1", label: "Push Day", muscleGroups: ["Chest"], exercises: [{ id: "e3", exerciseId: "x2", sets: [{}] }] };
const legs = { id: "t1", label: "Leg Template", muscleGroups: ["Quads"], exercises: [{ exerciseId: "x3", sets: [{}] }, { exerciseId: "x4", sets: [{}] }] };

function setup({ viewingAsClient = true } = {}) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-18T10:00:00")); // Wednesday
  ctx = {
    viewingAsClient,
    currentUser: { id: "c1", name: "Geoff Bennett", role: "client" },
    db: {
      users: [],
      exercises: [],
      masterWorkouts: [legs],
      messages: {},
      workoutLogs: { c1: [] },
      scheduledWorkouts: {
        c1: [
          { id: "s1", date: "2026-11-18", label: "Pull Day", exercises: pull.exercises },
          { id: "s2", date: "2026-11-20", label: "Push Day", exercises: push.exercises },
        ],
      },
      clientPhases: {
        c1: [
          { id: "p0", name: "Old Phase", startDate: "2026-10-01", endDate: "2026-11-01", weeks: [{ id: "w1", days: [{ id: "o1", label: "Old Day", exercises: [] }] }] },
          { id: "p1", name: "Strength Phase", startDate: "2026-11-02", endDate: "2026-12-06", weeks: [{ id: "w1", days: [push, pull] }] },
        ],
      },
    },
    saveScheduledWorkout: vi.fn(() => Promise.resolve()),
    deleteScheduledWorkoutById: vi.fn(),
    updateClientPhase: vi.fn(() => Promise.resolve()),
  };
}

async function renderTraining(over = {}, dark = false) {
  const { WorkoutsScreen, ClientThemeContext } = await import("./ClientApp");
  const props = {
    onStart: vi.fn(),
    onDiscardWorkout: vi.fn(),
    onViewWorkout: vi.fn(),
    onPreviewWorkout: vi.fn(),
    onLogCardio: vi.fn(),
    showToast: vi.fn(),
    ...over,
  };
  render(
    <ClientThemeContext.Provider value={dark}>
      <WorkoutsScreen
        todaySession={pull}
        todayScheduledEntry={{ id: "s1", date: "2026-11-18", label: "Pull Day", exercises: pull.exercises }}
        scheduledWorkoutsByDate={{ "2026-11-18": { id: "s1", label: "Pull Day" } }}
        activeLog={null}
        completedOnDate={false}
        logsForClient={[]}
        exercisesById={{}}
        dbReady
        {...props}
      />
    </ClientThemeContext.Provider>
  );
  return props;
}

const card = () => screen.getByTestId("training-today-card");

describe("Training tab — Today buttons (#273)", () => {
  it("Start Workout and the eye (View) do what they say", async () => {
    setup();
    const p = await renderTraining();
    fireEvent.click(within(card()).getByText("START WORKOUT"));
    expect(p.onStart).toHaveBeenCalledTimes(1);
    fireEvent.click(within(card()).getByLabelText("View workout"));
    expect(p.onViewWorkout).toHaveBeenCalledTimes(1);
  });

  it("a started workout says Resume, and discard asks once before it discards", async () => {
    setup();
    const p = await renderTraining({ activeLog: { e1: [{ completed: true }, { completed: false }] } });
    expect(within(card()).getByText("RESUME WORKOUT")).toBeTruthy();
    expect(card().textContent).toMatch(/1\/2 sets/);
    fireEvent.click(within(card()).getByText(/discard progress/));
    expect(p.onDiscardWorkout).not.toHaveBeenCalled();
    fireEvent.click(within(card()).getByText(/Tap again to discard/));
    expect(p.onDiscardWorkout).toHaveBeenCalledTimes(1);
  });

  it("a completed day shows VIEW, which opens the workout", async () => {
    setup();
    const p = await renderTraining({ completedOnDate: true });
    expect(within(card()).queryByText("START WORKOUT")).toBeNull();
    fireEvent.click(within(card()).getByText("VIEW"));
    expect(p.onViewWorkout).toHaveBeenCalledTimes(1);
  });

  it("Edit / move opens today's workout in the editor and Save goes to the calendar save", async () => {
    setup();
    const p = await renderTraining();
    fireEvent.click(screen.getByRole("button", { name: /Edit \/ move/ }));
    const editor = await screen.findByTestId("workout-editor");
    expect(editor.dataset.label).toBe("Pull Day");
    fireEvent.click(screen.getByText("EDITOR SAVE"));
    await waitFor(() => expect(ctx.saveScheduledWorkout).toHaveBeenCalledWith("c1", expect.objectContaining({ previousId: "s1", label: "Pull Day", date: "2026-11-18" })));
    await waitFor(() => expect(p.showToast).toHaveBeenCalledWith("Workout saved for today"));
    expect(screen.queryByTestId("workout-editor")).toBeNull();
  });

  it("Remove asks first; Cancel keeps it, Remove deletes today's entry", async () => {
    setup();
    const p = await renderTraining();
    const row = () => within(screen.getByTestId("training-actions")).getByRole("button", { name: /^Remove$/ });
    fireEvent.click(row());
    expect(await screen.findByText("Remove today's workout?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(ctx.deleteScheduledWorkoutById).not.toHaveBeenCalled();
    fireEvent.click(row());
    const sheetRemove = screen.getAllByRole("button", { name: "Remove" }).find((b) => b.className.includes("bg-red-600"));
    fireEvent.click(sheetRemove);
    expect(ctx.deleteScheduledWorkoutById).toHaveBeenCalledWith("s1");
    expect(p.showToast).toHaveBeenCalledWith("Workout removed");
  });

  it("Create workout of the day: from scratch, or from the library with the template's exercises", async () => {
    setup();
    await renderTraining();
    fireEvent.click(screen.getByRole("button", { name: /Create workout of the day/ }));
    fireEvent.click(await screen.findByText("Build from scratch"));
    let editor = await screen.findByTestId("workout-editor");
    expect(editor.dataset.label).toBe("Workout of the Day");
    fireEvent.click(screen.getByText("EDITOR CLOSE"));
    fireEvent.click(screen.getByRole("button", { name: /Create workout of the day/ }));
    fireEvent.click(await screen.findByText("Leg Template"));
    editor = await screen.findByTestId("workout-editor");
    expect(editor.dataset.label).toBe("Leg Template");
    expect(editor.dataset.exercises).toBe("2");
    fireEvent.click(screen.getByText("EDITOR SAVE"));
    await waitFor(() => expect(ctx.saveScheduledWorkout).toHaveBeenCalledWith("c1", expect.objectContaining({ previousId: null, label: "Leg Template", wod: true })));
  });

  it("Log a cardio session opens the cardio sheet and saves through onLogCardio", async () => {
    setup();
    const p = await renderTraining();
    fireEvent.click(screen.getByRole("button", { name: /Log a cardio session/ }));
    const save = await screen.findByRole("button", { name: /LOG ACTIVITY/ });
    fireEvent.click(save);
    expect(p.onLogCardio).toHaveBeenCalledTimes(1);
  });

  it("a real client sees only Log a cardio session (no coach rows)", async () => {
    setup({ viewingAsClient: false });
    await renderTraining();
    const actions = screen.getByTestId("training-actions");
    expect(within(actions).getAllByRole("button").map((b) => b.textContent)).toEqual(["Log a cardio session"]);
  });
});

describe("Training tab — Program buttons (#273)", () => {
  async function openProgram(over, dark) {
    const p = await renderTraining(over, dark);
    fireEvent.click(screen.getByRole("button", { name: /^program$/i }));
    return p;
  }

  it("the switch goes to Program and back to Today", async () => {
    setup();
    await openProgram();
    expect(screen.getByTestId("training-phase-card")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^today$/i }));
    expect(screen.getByTestId("training-today-card")).toBeTruthy();
  });

  it("each workout row and each Up next row opens that workout", async () => {
    setup();
    const p = await openProgram();
    const rows = within(screen.getByTestId("training-phase-workouts")).getAllByRole("button");
    fireEvent.click(rows.find((b) => /Push Day/.test(b.textContent)));
    expect(p.onPreviewWorkout).toHaveBeenLastCalledWith(push);
    fireEvent.click(rows.find((b) => /Pull Day/.test(b.textContent)));
    expect(p.onPreviewWorkout).toHaveBeenLastCalledWith(pull);
    // Up next: Friday's Push Day from the calendar
    const upNext = screen.getByTestId("training-up-next");
    fireEvent.click(within(upNext).getByText("Push Day"));
    expect(upNext.textContent).toMatch(/1 exercise/); // the same glass row as the phase list
    expect(p.onPreviewWorkout).toHaveBeenLastCalledWith(expect.objectContaining({ id: "s2", date: "2026-11-20" }));
  });

  it("Phases opens the list and picking an old phase shows it", async () => {
    setup();
    await openProgram();
    fireEvent.click(screen.getByRole("button", { name: /phases/i }));
    fireEvent.click(await screen.findByText("Old Phase"));
    await waitFor(() => expect(within(screen.getByTestId("training-phase-card")).getByText("Old Phase")).toBeTruthy());
    expect(within(screen.getByTestId("training-phase-workouts")).getByText("Old Day")).toBeTruthy();
  });

  it("Add workout and Import open the editor and save into the phase", async () => {
    setup();
    const p = await openProgram();
    fireEvent.click(screen.getByRole("button", { name: /ADD WORKOUT/ }));
    let editor = await screen.findByTestId("workout-editor");
    expect(editor.dataset.label).toBe("Workout 3");
    fireEvent.click(screen.getByText("EDITOR SAVE"));
    await waitFor(() => expect(ctx.updateClientPhase).toHaveBeenCalledTimes(1));
    const saved = ctx.updateClientPhase.mock.calls[0][2].weeks[0].days;
    expect(saved.map((d) => d.label)).toEqual(["Push Day", "Pull Day", "Workout 3"]);
    await waitFor(() => expect(p.showToast).toHaveBeenCalledWith("Workout saved"));

    fireEvent.click(screen.getByRole("button", { name: /IMPORT/ }));
    fireEvent.click(await screen.findByText("Leg Template"));
    editor = await screen.findByTestId("workout-editor");
    expect(editor.dataset.label).toBe("Leg Template");
    expect(editor.dataset.exercises).toBe("2");
  });

  it("light mode's background glows cover the whole page, never stop on a line part-way down", async () => {
    setup();
    await renderTraining();
    expect(screen.getByTestId("training-glows").className).toMatch(/\binset-0\b/);
    expect(screen.getByTestId("training-glows").className).not.toMatch(/h-\[760px\]/);
  });

  it("a real client gets no Add workout / Import", async () => {
    setup({ viewingAsClient: false });
    await openProgram();
    expect(screen.queryByRole("button", { name: /ADD WORKOUT/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /IMPORT/ })).toBeNull();
  });
});
