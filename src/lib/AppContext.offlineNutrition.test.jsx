// @vitest-environment jsdom
//
// Logging food or water. setNutritionForDate used a server transaction, so
// every food, water tap or edit waited on a round trip to the server
// (slow on mobile data, impossible offline). It is now local-first
// (REGRESSION_TESTS.md #126): the change is applied to the phone's copy of
// the day and saved with setDoc, which shows on screen at once; the call
// returns without waiting for the server ("saved", or "queued" offline).
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { AppProvider, useApp } from "./AppContext";

const fs = vi.hoisted(() => ({
  setDoc: null,
  getDocFromCache: null,
  getDoc: null,
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
  getDoc: (...a) => fs.getDoc(...a),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  getDocsFromCache: vi.fn(() => Promise.resolve({ docs: [] })),
  getDocFromCache: (...a) => fs.getDocFromCache(...a),
  query: (ref) => ref,
  where: vi.fn(),
  documentId: vi.fn(),
  onSnapshot: () => () => {},
  writeBatch: vi.fn(),
  deleteField: vi.fn(),
  arrayRemove: vi.fn(),
}));

let api;
function Probe() {
  api = useApp();
  return null;
}

const CACHED_DAY = { id: "c1__2026-10-28", clientId: "c1", date: "2026-10-28", calories: 100, meals: { Breakfast: [{ id: "a", name: "Apple", cals: 100 }] } };

// The phone's copy of each day: starts with CACHED_DAY and, like
// Firestore's real cache, reflects every setDoc the moment it's made.
let phone;
beforeEach(() => {
  phone = new Map([[CACHED_DAY.id, CACHED_DAY]]);
  fs.setDoc = vi.fn((ref, data) => {
    phone.set(ref.path.split("/")[1], data);
    return new Promise(() => {}); // the server never answers in these tests
  });
  fs.getDocFromCache = vi.fn(async (ref) => {
    const data = phone.get(ref.path.split("/")[1]);
    if (!data) throw Object.assign(new Error("Failed to get document from cache."), { code: "unavailable" });
    return { exists: () => true, data: () => data };
  });
  fs.getDoc = vi.fn(async () => ({ exists: () => false }));
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

describe("coached app: logging nutrition is local-first (#126)", () => {
  const written = () => fs.setDoc.mock.calls.filter(([ref]) => /nutritionLogs/.test(ref.path)).map((c) => c[1]);

  it("online, returns 'saved' straight away without waiting for the server, building on the phone's copy", async () => {
    render(<AppProvider><Probe /></AppProvider>);
    let result = "still waiting";
    api.setNutritionForDate("c1", "2026-10-28", addBanana).then((r) => (result = r));
    await act(async () => {});
    expect(result).toBe("saved"); // the server (setDoc's promise) never answered
    const day = written()[0];
    expect(day.meals.Breakfast.map((f) => f.name)).toEqual(["Apple", "Banana"]);
    expect(day.calories).toBe(205);
    expect(day).toMatchObject({ id: "c1__2026-10-28", clientId: "c1", date: "2026-10-28" });
  });

  it("offline, comes back 'queued' and still builds on the phone's copy", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    render(<AppProvider><Probe /></AppProvider>);
    await expect(api.setNutritionForDate("c1", "2026-10-28", addBanana)).resolves.toBe("queued");
    expect(written()[0].meals.Breakfast.map((f) => f.name)).toEqual(["Apple", "Banana"]);
    expect(fs.getDoc).not.toHaveBeenCalled();
  });

  it("two quick saves to the same day never overwrite each other", async () => {
    render(<AppProvider><Probe /></AppProvider>);
    const addWater = (d) => ({ ...d, water: (d?.water || 0) + 0.25 });
    await Promise.all([api.setNutritionForDate("c1", "2026-10-28", addBanana), api.setNutritionForDate("c1", "2026-10-28", addWater)]);
    const last = written().at(-1);
    expect(last.meals.Breakfast.map((f) => f.name)).toEqual(["Apple", "Banana"]);
    expect(last.water).toBe(0.25);
  });

  it("a day not on the phone, before the server has answered the listener, is read from the server once so nothing is replaced", async () => {
    fs.getDoc = vi.fn(async () => ({ exists: () => true, data: () => ({ id: "c1__2026-10-27", clientId: "c1", date: "2026-10-27", calories: 300, meals: { Breakfast: [{ id: "o", name: "Oats", cals: 300 }] } }) }));
    render(<AppProvider><Probe /></AppProvider>);
    await api.setNutritionForDate("c1", "2026-10-27", addBanana);
    expect(fs.getDoc).toHaveBeenCalledTimes(1);
    expect(written()[0].meals.Breakfast.map((f) => f.name)).toEqual(["Oats", "Banana"]);
  });

  it("a brand-new day starts empty", async () => {
    render(<AppProvider><Probe /></AppProvider>);
    await api.setNutritionForDate("c1", "2026-10-29", addBanana);
    expect(written()[0].meals.Breakfast.map((f) => f.name)).toEqual(["Banana"]);
  });

  it("an updater that refuses (e.g. the entry is gone) is reported and nothing is written", async () => {
    render(<AppProvider><Probe /></AppProvider>);
    await expect(
      api.setNutritionForDate("c1", "2026-10-28", () => {
        throw new Error("That entry is no longer in your log");
      })
    ).rejects.toThrow(/Couldn't save — That entry is no longer in your log/);
    expect(written()).toHaveLength(0);
  });

  it("a failure the server reports later isn't silent", async () => {
    const { onLocalWriteFailed } = await import("./offlineWrite");
    const seen = [];
    const stop = onLocalWriteFailed((err, label) => seen.push([label, err.message]));
    fs.setDoc = vi.fn(() => Promise.reject(new Error("Missing or insufficient permissions.")));
    render(<AppProvider><Probe /></AppProvider>);
    await expect(api.setNutritionForDate("c1", "2026-10-28", addBanana)).resolves.toBe("saved");
    await act(async () => {});
    expect(seen).toEqual([["nutrition", "Missing or insufficient permissions."]]);
    stop();
  });
});
