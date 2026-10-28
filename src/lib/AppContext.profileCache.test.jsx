// @vitest-environment jsdom
//
// Register #103: a cold open sat on the grey "M" splash until the signed-in
// user's users/{uid} doc had loaded, on top of Firebase restoring the
// session. The last profile is now kept on the phone and used the moment
// Firebase confirms the same account, so the app opens without that wait.
// It must never be used for a different account, and a sign-out clears it.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { AppProvider, useApp, PROFILE_CACHE_KEY } from "./AppContext";

let authCb;
let profileSnapCb;
vi.mock("./firebase", () => ({ auth: {}, db: {}, functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => vi.fn()) }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth, cb) => {
    authCb = cb;
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
  query: (ref) => ref,
  where: vi.fn(),
  documentId: vi.fn(),
  // Only the profile listener is captured; the server never answers it
  // unless a test calls profileSnapCb itself.
  onSnapshot: (ref, cb) => {
    if (ref?.path?.startsWith("users/")) profileSnapCb = cb;
    return () => {};
  },
  writeBatch: vi.fn(),
  deleteField: vi.fn(),
  runTransaction: vi.fn(),
  arrayRemove: vi.fn(),
}));

let api;
function Probe() {
  api = useApp();
  return null;
}

beforeEach(() => {
  localStorage.clear();
  authCb = null;
  profileSnapCb = null;
});
afterEach(cleanup);

describe("cold open: saved profile", () => {
  it("opens straight away for the same account, before the profile read answers", () => {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ id: "coach1", role: "coach", name: "Zach" }));
    render(<AppProvider><Probe /></AppProvider>);
    act(() => authCb({ uid: "coach1" }));
    expect(api.sessionLoading).toBe(false);
    expect(api.currentUser.role).toBe("coach");
  });

  it("never uses another account's saved profile", () => {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ id: "coach1", role: "coach" }));
    render(<AppProvider><Probe /></AppProvider>);
    act(() => authCb({ uid: "client7" }));
    expect(api.sessionLoading).toBe(true);
    expect(api.currentUser).toBe(null);
  });

  it("the live profile replaces the saved one and is saved for next time", () => {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ id: "c1", role: "client", name: "Old" }));
    render(<AppProvider><Probe /></AppProvider>);
    act(() => authCb({ uid: "c1" }));
    act(() => profileSnapCb({ id: "c1", exists: () => true, data: () => ({ role: "client", name: "New" }), metadata: { fromCache: false } }));
    expect(api.currentUser.name).toBe("New");
    expect(JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY)).name).toBe("New");
  });

  it("opening offline without the doc in Firestore's cache keeps the saved profile", () => {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ id: "c1", role: "client" }));
    render(<AppProvider><Probe /></AppProvider>);
    act(() => authCb({ uid: "c1" }));
    act(() => profileSnapCb({ id: "c1", exists: () => false, metadata: { fromCache: true } }));
    expect(api.sessionLoading).toBe(false);
  });

  it("signing out clears it", () => {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ id: "c1", role: "client" }));
    render(<AppProvider><Probe /></AppProvider>);
    act(() => authCb(null));
    expect(localStorage.getItem(PROFILE_CACHE_KEY)).toBe(null);
  });
});
