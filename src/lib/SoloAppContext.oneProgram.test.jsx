// @vitest-environment jsdom
//
// #140: one program at a time in the data layer — only the profile's
// current program is current, and an older account with several programs
// running is moved to one current program (the rest archived) once.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { SoloAppProvider, useSoloApp } from "./SoloAppContext";

vi.mock("./firebase", () => ({ soloAuth: {}, soloDb: {}, soloFunctions: {} }));
vi.mock("./push", () => ({ removeSoloPushToken: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => () => Promise.resolve({ data: {} }) }));
vi.mock("./purchases", () => ({ inAppPurchasesAvailable: () => false, identifyPurchaser: vi.fn(), forgetPurchaser: vi.fn() }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth, cb) => {
    cb({ uid: "u1", email: "u1@example.invalid" });
    return () => {};
  },
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  EmailAuthProvider: { credential: vi.fn() },
  reauthenticateWithCredential: vi.fn(),
  deleteUser: vi.fn(),
}));

const h = vi.hoisted(() => ({ listeners: {}, batches: [] }));
vi.mock("firebase/firestore", () => ({
  doc: (...args) => ({ path: args.slice(1).join("/") }),
  setDoc: vi.fn(),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  getDocs: vi.fn(),
  getDocFromServer: () => Promise.resolve({ exists: () => true }),
  writeBatch: () => {
    const ops = [];
    h.batches.push(ops);
    return {
      update: (ref, data) => ops.push(["update", ref.path, data]),
      set: (ref, data) => ops.push(["set", ref.path, data]),
      commit: () => Promise.resolve(),
    };
  },
  onSnapshot: (ref, ...rest) => {
    const cb = rest.find((a) => typeof a === "function");
    const key = ref?.path || ref?.__collection || "query";
    (h.listeners[key] = h.listeners[key] || []).push(cb);
    return () => {};
  },
  collection: (_db, name) => ({ __collection: name }),
  query: (c) => ({ __collection: c.__collection }),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
}));

const daysAgo = (n) => {
  const d = new Date(Date.now() - n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const emit = (key, value) => act(() => (h.listeners[key] || []).forEach((cb) => cb(value)));
const docSnap = (id, data) => ({ id, exists: () => !!data, data: () => data, metadata: { fromCache: false } });
const listSnap = (docs) => ({ docs: docs.map((d) => ({ id: d.id, data: () => d })) });

function Probe() {
  const { soloTrainingPrograms, soloCurrentProgram } = useSoloApp();
  return <p data-testid="probe">{`${soloCurrentProgram?.programId || "none"}|${soloTrainingPrograms.filter((r) => r.current).length}|${soloTrainingPrograms.length}`}</p>;
}

beforeEach(() => {
  for (const k of Object.keys(h.listeners)) delete h.listeners[k];
  h.batches.length = 0;
  localStorage.clear();
});
afterEach(cleanup);

describe("one program at a time: data layer (#140)", () => {
  it("an older account with two programs running gets one current, the other archived — written once", async () => {
    render(<SoloAppProvider><Probe /></SoloAppProvider>);
    emit("soloUsers/u1", docSnap("u1", { name: "T" }));
    emit("soloPurchases", listSnap([
      { id: "u1_a", soloUserId: "u1", programId: "a", startDate: daysAgo(20) },
      { id: "u1_b", soloUserId: "u1", programId: "b", startDate: daysAgo(3) },
    ]));
    emit("soloEnrolments", listSnap([]));
    emit("soloCustomPrograms", listSnap([]));
    // Only one is current straight away (the latest started).
    expect(screen.getByTestId("probe").textContent).toBe("b|1|2");
    await waitFor(() => expect(h.batches.length).toBe(1));
    const [op] = h.batches[0];
    expect(op[0]).toBe("update");
    expect(op[1]).toBe("soloUsers/u1");
    expect(op[2].currentProgramId).toBe("b");
    expect(op[2].archivedPrograms.a.archivedAt).toBeTruthy();
    // The saved choice then holds, and nothing more is written.
    emit("soloUsers/u1", docSnap("u1", { name: "T", ...op[2] }));
    expect(screen.getByTestId("probe").textContent).toBe("b|1|2");
    expect(h.batches.length).toBe(1);
  });

  it("the profile's current program is the only current one", () => {
    render(<SoloAppProvider><Probe /></SoloAppProvider>);
    emit("soloUsers/u1", docSnap("u1", { currentProgramId: "a", archivedPrograms: { b: { archivedAt: daysAgo(1), archivedAtWeek: 1 } } }));
    emit("soloPurchases", listSnap([
      { id: "u1_a", soloUserId: "u1", programId: "a", startDate: daysAgo(20) },
      { id: "u1_b", soloUserId: "u1", programId: "b", startDate: daysAgo(3) },
    ]));
    expect(screen.getByTestId("probe").textContent).toBe("a|1|2");
  });
});
