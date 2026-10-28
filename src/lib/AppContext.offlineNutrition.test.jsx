// @vitest-environment jsdom
//
// Logging food or water with no signal. setNutritionForDate used a
// Firestore transaction, and a transaction can't run offline at all (it
// has to read the server's copy first), so every log in a gym with no
// reception failed with "Couldn't save". Offline it now applies the same
// change to the phone's own copy of the day and writes it with setDoc,
// which the phone keeps and sends later — resolving "queued".
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { AppProvider, useApp } from "./AppContext";

const fs = vi.hoisted(() => ({
  setDoc: null,
  runTransaction: null,
  getDocsFromCache: null,
}));

vi.mock("./firebase", () => ({ auth: {}, db: {}, functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => vi.fn()) }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth, cb) => {
    cb(null);
    return () => {};
  },
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  EmailAuthProvider: { credential: vi.fn() },
  reauthenticateWithCredential: vi.fn(),
  verifyBeforeUpdateEmail: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  collection: (_db, name) => ({ collection: name }),
  doc: (...args) => ({ path: args.slice(1).join("/") }),
  setDoc: (...a) => fs.setDoc(...a),
  updateDoc: vi.fn(() => new Promise(() => {})),
  deleteDoc: vi.fn(() => Promise.resolve()),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  getDocsFromCache: (...a) => fs.getDocsFromCache(...a),
  query: (ref) => ref,
  where: vi.fn(),
  documentId: vi.fn(),
  onSnapshot: () => () => {},
  writeBatch: vi.fn(),
  deleteField: vi.fn(),
  runTransaction: (...a) => fs.runTransaction(...a),
  arrayRemove: vi.fn(),
}));

let api;
function Probe() {
  api = useApp();
  return null;
}

const CACHED_DAY = { id: "c1__2026-10-28", clientId: "c1", date: "2026-10-28", calories: 100, meals: { Breakfast: [{ id: "a", name: "Apple", cals: 100 }] } };

beforeEach(() => {
  fs.setDoc = vi.fn(() => new Promise(() => {})); // no signal: the server never answers
  fs.runTransaction = vi.fn(() => Promise.reject(Object.assign(new Error("Failed to get document because the client is offline."), { code: "unavailable" })));
  fs.getDocsFromCache = vi.fn(() => Promise.resolve({ docs: [{ id: CACHED_DAY.id, data: () => CACHED_DAY }] }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function addBanana(day) {
  const base = day || { calories: 0, meals: {} };
  return { ...base, calories: base.calories + 105, meals: { ...base.meals, Breakfast: [...(base.meals.Breakfast || []), { id: "b", name: "Banana", cals: 105 }] } };
}

describe("coached app: logging nutrition offline", () => {
  it("when the transaction reports the server unreachable, builds on the phone's copy of the day and comes back queued", async () => {
    vi.useFakeTimers();
    render(<AppProvider><Probe /></AppProvider>);
    let result = "still waiting";
    api.setNutritionForDate("c1", "2026-10-28", addBanana).then((r) => (result = r));
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(result).toBe("queued");
    const written = fs.setDoc.mock.calls.find(([ref]) => /nutritionLogs/.test(ref.path))[1];
    // The cached Apple is kept — the offline write builds on the phone's
    // copy, never replaces the day with just the new food.
    expect(written.meals.Breakfast.map((f) => f.name)).toEqual(["Apple", "Banana"]);
    expect(written.calories).toBe(205);
    expect(written).toMatchObject({ id: "c1__2026-10-28", clientId: "c1", date: "2026-10-28" });
  });

  it("skips the transaction entirely when the phone already knows it's offline", async () => {
    vi.useFakeTimers();
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    render(<AppProvider><Probe /></AppProvider>);
    let result = "still waiting";
    api.setNutritionForDate("c1", "2026-10-28", addBanana).then((r) => (result = r));
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(result).toBe("queued");
    expect(fs.runTransaction).not.toHaveBeenCalled();
  });

  it("a day that isn't on the phone yet starts empty", async () => {
    vi.useFakeTimers();
    fs.getDocsFromCache = vi.fn(() => Promise.resolve({ docs: [] }));
    render(<AppProvider><Probe /></AppProvider>);
    api.setNutritionForDate("c1", "2026-10-29", addBanana);
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(fs.setDoc.mock.calls.find(([ref]) => /nutritionLogs/.test(ref.path))[1].meals.Breakfast.map((f) => f.name)).toEqual(["Banana"]);
  });

  it("online, the transaction still does the save and nothing is written twice", async () => {
    fs.runTransaction = vi.fn(async (_db, fn) => {
      const tx = { get: async () => ({ exists: () => false }), set: vi.fn() };
      await fn(tx);
    });
    render(<AppProvider><Probe /></AppProvider>);
    await expect(api.setNutritionForDate("c1", "2026-10-28", addBanana)).resolves.toBe("saved");
    expect(fs.setDoc).not.toHaveBeenCalled();
  });

  it("any other failure is still reported, not swallowed", async () => {
    fs.runTransaction = vi.fn(() => Promise.reject(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" })));
    render(<AppProvider><Probe /></AppProvider>);
    await expect(api.setNutritionForDate("c1", "2026-10-28", addBanana)).rejects.toThrow(/Couldn't save/);
    // (The failure itself is logged to clientErrors — that write is fine.)
    expect(fs.setDoc.mock.calls.filter(([ref]) => /nutritionLogs/.test(ref.path))).toHaveLength(0);
  });
});
