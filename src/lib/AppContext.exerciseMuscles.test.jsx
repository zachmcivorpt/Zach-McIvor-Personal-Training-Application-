// @vitest-environment jsdom
//
// #149: opening the coach console corrects every exercise whose stored
// Primary / Secondary Muscles differ from its movement — only those are
// written, a coach's manual choice is left alone, and clients never write.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { AppProvider } from "./AppContext";

const state = vi.hoisted(() => ({ role: "coach", updates: [], commits: 0 }));

vi.mock("./firebase", () => ({ auth: {}, db: {}, functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => vi.fn()) }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth, cb) => {
    cb({ uid: "u1" });
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
const EXERCISES = [
  { id: "bench", name: "Bench Press", category: "Chest", primaryMuscles: ["Pecs"], secondaryMuscles: [] },
  { id: "squat", name: "Back Squat", category: "Legs", primaryMuscles: ["Quads", "Glutes"], secondaryMuscles: ["Hamstrings"] },
  { id: "mine", name: "Romanian Deadlift", category: "Legs", primaryMuscles: ["Hamstrings"], secondaryMuscles: [], musclesSource: "manual" },
];
vi.mock("firebase/firestore", () => ({
  collection: (_db, name) => ({ collection: name }),
  doc: (...args) => ({ path: args.slice(1).join("/") }),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  getDocsFromCache: vi.fn(() => Promise.resolve({ docs: [] })),
  query: (ref) => ref,
  where: vi.fn(),
  documentId: vi.fn(),
  onSnapshot: (ref, next) => {
    if (ref.path === "users/u1") next({ exists: () => true, id: "u1", data: () => ({ role: state.role, name: "Test" }) });
    else if (ref.collection === "exercises") next({ docs: EXERCISES.map((e) => ({ id: e.id, data: () => e })) });
    return () => {};
  },
  writeBatch: () => ({
    update: (ref, data) => state.updates.push([ref.path, data]),
    set: vi.fn(),
    delete: vi.fn(),
    commit: () => {
      state.commits += 1;
      return Promise.resolve();
    },
  }),
  deleteField: vi.fn(),
  runTransaction: vi.fn(),
  arrayRemove: vi.fn(),
}));

afterEach(() => {
  cleanup();
  state.updates = [];
  state.commits = 0;
});

describe("exercise muscles corrected from the coach console (#149)", () => {
  it("writes only the exercise that's wrong, and not the coach's manual one", async () => {
    state.role = "coach";
    render(<AppProvider>{null}</AppProvider>);
    await waitFor(() => expect(state.commits).toBe(1));
    expect(state.updates).toEqual([["exercises/bench", { primaryMuscles: ["Chest"], secondaryMuscles: ["Triceps", "Shoulders"] }]]);
  });

  it("a client's app never writes to the library", async () => {
    state.role = "client";
    render(<AppProvider>{null}</AppProvider>);
    await new Promise((r) => setTimeout(r, 50));
    expect(state.updates).toEqual([]);
  });
});
