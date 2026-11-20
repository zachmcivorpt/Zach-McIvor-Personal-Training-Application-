// @vitest-environment jsdom
// #313 (owner): a client's whole history was lost to Remove client with no
// backup. Remove client now ARCHIVES an activated client (access paused,
// hidden from the coach's lists, restorable for 30 days); nothing is
// deleted until "Delete now" or the server's 30-day purge. Runs the REAL
// AppProvider with Firebase mocked.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { AppProvider, useApp } from "./AppContext";

const fb = vi.hoisted(() => ({ authCb: null, listeners: {}, updates: [], deletes: [] }));
vi.mock("./firebase", () => ({ auth: {}, db: {}, functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => vi.fn(() => Promise.resolve())) }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_a, cb) => {
    fb.authCb = cb;
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
  updateDoc: vi.fn((ref, data) => {
    fb.updates.push([ref.path, data]);
    return Promise.resolve();
  }),
  deleteDoc: vi.fn((ref) => {
    fb.deletes.push(ref.path);
    return Promise.resolve();
  }),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  query: (ref) => ref,
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  documentId: vi.fn(),
  onSnapshot: (ref, ...rest) => {
    const cb = rest.find((a) => typeof a === "function");
    const key = ref?.collection || ref?.path;
    if (key) fb.listeners[key] = cb;
    return () => {};
  },
  writeBatch: () => ({ delete: vi.fn(), set: vi.fn(), update: vi.fn(), commit: () => Promise.resolve() }),
  deleteField: () => "__delete__",
  runTransaction: vi.fn(),
  arrayRemove: vi.fn(),
  arrayUnion: vi.fn(),
  increment: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: { now: () => ({}) },
}));

let api;
function Probe() {
  api = useApp();
  return null;
}
const snapOf = (rows) => ({ docs: rows.map((r) => ({ id: r.id, data: () => r })), metadata: { fromCache: false } });
const coach = { id: "coach1", role: "coach", name: "Zach" };
const rusiru = { id: "r1", role: "client", name: "Rusiru", email: "r@example.invalid", status: "active" };

function setup(users) {
  render(<AppProvider><Probe /></AppProvider>);
  act(() => fb.authCb({ uid: "coach1" }));
  act(() => fb.listeners["users/coach1"]?.({ exists: () => true, id: "coach1", data: () => coach, metadata: {} }));
  act(() => fb.listeners.users?.(snapOf([coach, ...users])));
}

beforeEach(() => {
  localStorage.clear();
  Object.assign(fb, { authCb: null, listeners: {}, updates: [], deletes: [] });
});
afterEach(cleanup);

describe("Remove client archives instead of deleting (#313)", () => {
  it("Remove archives: access paused, nothing deleted", async () => {
    setup([rusiru]);
    expect(api.db.users.some((u) => u.id === "r1")).toBe(true);
    await act(async () => api.removeClient("r1"));
    expect(fb.deletes).toEqual([]);
    const [path, data] = fb.updates.find(([p, d]) => p === "users/r1" && d.archivedAt);
    expect(path).toBe("users/r1");
    expect(data).toMatchObject({ accessPaused: true, archivedPrevAccessPaused: false });
  });

  it("an archived client leaves the coach's lists and shows under Archived; Restore brings back their old access", async () => {
    setup([{ ...rusiru, archivedAt: Date.now(), accessPaused: true, archivedPrevAccessPaused: false }]);
    expect(api.db.users.some((u) => u.id === "r1")).toBe(false);
    expect(api.db.archivedClients.map((u) => u.id)).toEqual(["r1"]);
    await act(async () => api.restoreClient("r1"));
    expect(fb.updates.at(-1)).toEqual(["users/r1", { archivedAt: "__delete__", archivedPrevAccessPaused: "__delete__", accessPaused: false }]);
    expect(fb.deletes).toEqual([]);
  });

  it("Delete now still deletes for good", async () => {
    setup([{ ...rusiru, archivedAt: Date.now(), accessPaused: true }]);
    await act(async () => api.deleteClientNow("r1"));
    expect(fb.deletes).toContain("users/r1");
  });
});
