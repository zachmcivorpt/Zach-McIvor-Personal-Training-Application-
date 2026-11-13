// @vitest-environment jsdom
// #230: a coach in View as Client stays there when the page reloads (iOS
// rebuilds the web view after leaving the app), instead of landing on the
// client's overview in the coach console.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { AppProvider, useApp, VIEW_AS_KEY } from "./AppContext";

const state = vi.hoisted(() => ({ me: "coach1", role: "coach", usersCb: null }));

vi.mock("./firebase", () => ({ auth: {}, db: {}, functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => vi.fn()) }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth, cb) => {
    cb({ uid: state.me });
    return () => {};
  },
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(() => Promise.resolve()),
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
  onSnapshot: (ref, ...rest) => {
    const next = rest.find((f) => typeof f === "function");
    if (ref.path === `users/${state.me}`) next({ exists: () => true, id: state.me, data: () => ({ role: state.role, name: "Coach" }) });
    else if (ref.collection === "users") state.usersCb = next;
    return () => {};
  },
  writeBatch: vi.fn(() => ({ update: vi.fn(), commit: vi.fn(() => Promise.resolve()) })),
  deleteField: vi.fn(),
  runTransaction: vi.fn(),
  arrayRemove: vi.fn(),
}));

let api;
function Probe() {
  api = useApp();
  return null;
}
const sendUsers = () =>
  act(() =>
    state.usersCb({
      docs: [
        { id: "coach1", data: () => ({ role: "coach", name: "Coach" }) },
        { id: "c1", data: () => ({ role: "client", name: "Jarrod" }) },
      ],
    })
  );

afterEach(() => {
  cleanup();
  localStorage.clear();
  state.me = "coach1";
  state.usersCb = null;
});

describe("View as Client survives a reload (#230)", () => {
  it("starting it is remembered on the phone, leaving it forgets", async () => {
    render(<AppProvider><Probe /></AppProvider>);
    await waitFor(() => expect(api.realUser?.id).toBe("coach1"));
    act(() => api.startViewAsClient("c1"));
    expect(JSON.parse(localStorage.getItem(VIEW_AS_KEY))).toEqual({ coachUid: "coach1", clientId: "c1" });
    act(() => api.stopViewAsClient());
    expect(localStorage.getItem(VIEW_AS_KEY)).toBeNull();
  });

  it("after a reload the coach is still viewing that client, loading until the client arrives", async () => {
    localStorage.setItem(VIEW_AS_KEY, JSON.stringify({ coachUid: "coach1", clientId: "c1" }));
    render(<AppProvider><Probe /></AppProvider>);
    await waitFor(() => expect(api.realUser?.id).toBe("coach1"));
    expect(api.sessionLoading).toBe(true); // never the coach console for a frame
    await waitFor(() => expect(state.usersCb).toBeTruthy());
    sendUsers();
    await waitFor(() => expect(api.currentUser?.id).toBe("c1"));
    expect(api.viewingAsClient).toBe(true);
    expect(api.sessionLoading).toBe(false);
  });

  it("another account signed in on the phone never gets it", async () => {
    localStorage.setItem(VIEW_AS_KEY, JSON.stringify({ coachUid: "someoneElse", clientId: "c1" }));
    render(<AppProvider><Probe /></AppProvider>);
    await waitFor(() => expect(api.realUser?.id).toBe("coach1"));
    await waitFor(() => expect(api.viewingAsClient).toBe(false));
    expect(api.currentUser?.id).toBe("coach1");
    expect(localStorage.getItem(VIEW_AS_KEY)).toBeNull();
  });
});
