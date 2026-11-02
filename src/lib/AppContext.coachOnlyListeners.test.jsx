// @vitest-environment jsdom
//
// soloProgramContent (every Train Solo program's full sessions) is coach-only
// to read in firestore.rules, but it was subscribed for every signed-in user.
// On a coached client's phone that listener was refused, logged an error and
// retried forever (backing off to every 16s) for as long as the app was open.
// Only the coach console uses it (CoachTrainSolo.jsx).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { AppProvider } from "./AppContext";

const state = vi.hoisted(() => ({ role: "client", watched: [] }));

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
    else if (ref.collection) state.watched.push(ref.collection);
    return () => {};
  },
  writeBatch: vi.fn(),
  deleteField: vi.fn(),
  runTransaction: vi.fn(),
  arrayRemove: vi.fn(),
}));

afterEach(() => {
  cleanup();
  state.watched = [];
});

describe("coach-only collections are not subscribed for clients", () => {
  it("a coached client never listens to soloProgramContent", async () => {
    state.role = "client";
    render(<AppProvider>{null}</AppProvider>);
    await waitFor(() => expect(state.watched).toContain("exercises"));
    expect(state.watched).not.toContain("soloProgramContent");
  });

  it("the coach still does (Train Solo program builder)", async () => {
    state.role = "coach";
    render(<AppProvider>{null}</AppProvider>);
    await waitFor(() => expect(state.watched).toContain("soloProgramContent"));
  });
});
