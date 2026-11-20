// @vitest-environment jsdom
// #312 (owner): Train Solo and Coaching share one login per email. Train
// Solo's Delete account deleted that login, so a coached client who also
// used Train Solo lost their coaching account. Runs the REAL
// deleteMySoloAccount with Firebase mocked.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { SoloAppProvider, useSoloApp } from "./SoloAppContext";

const user = { uid: "u1", email: "u1@example.invalid" };
vi.mock("./firebase", () => ({ soloAuth: { currentUser: { uid: "u1", email: "u1@example.invalid" } }, soloDb: {}, soloFunctions: {} }));
vi.mock("./push", () => ({ removeSoloPushToken: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => () => Promise.resolve({ data: {} }) }));
const auth = vi.hoisted(() => ({ deleteUser: vi.fn(() => Promise.resolve()), signOut: vi.fn(() => Promise.resolve()) }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_a, cb) => {
    cb(null);
    return () => {};
  },
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: auth.signOut,
  EmailAuthProvider: { credential: vi.fn() },
  reauthenticateWithCredential: vi.fn(() => Promise.resolve()),
  deleteUser: auth.deleteUser,
}));
const fs = vi.hoisted(() => ({ coached: false, readFails: false, deleted: [] }));
vi.mock("firebase/firestore", () => ({
  doc: (...args) => ({ path: args.slice(1).join("/") }),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn((ref) => {
    fs.deleted.push(ref.path);
    return Promise.resolve();
  }),
  deleteField: vi.fn(),
  getDocs: () => Promise.resolve({ docs: [] }),
  getDoc: (ref) => (fs.readFails ? Promise.reject(new Error("offline")) : Promise.resolve({ exists: () => ref.path === "users/u1" && fs.coached })),
  getDocFromServer: () => Promise.resolve({ exists: () => false }),
  writeBatch: () => ({ delete: vi.fn(), commit: () => Promise.resolve() }),
  onSnapshot: () => () => {},
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  increment: vi.fn(),
}));

let api;
function Grab() {
  api = useSoloApp();
  return null;
}
async function setup() {
  render(<SoloAppProvider><Grab /></SoloAppProvider>);
  await waitFor(() => expect(api?.deleteMySoloAccount).toBeTypeOf("function"));
}
afterEach(() => {
  cleanup();
  auth.deleteUser.mockClear();
  auth.signOut.mockClear();
  Object.assign(fs, { coached: false, readFails: false, deleted: [] });
});

describe("Train Solo Delete account never removes a coaching login (#312)", () => {
  it("a coached client: Train Solo data deleted, login kept, signed out of Train Solo", async () => {
    fs.coached = true;
    await setup();
    await api.deleteMySoloAccount("pw");
    expect(fs.deleted).toContain("soloUsers/u1");
    expect(auth.deleteUser).not.toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalled();
  });
  it("a Train Solo-only account: the login is deleted as before", async () => {
    await setup();
    await api.deleteMySoloAccount("pw");
    expect(auth.deleteUser).toHaveBeenCalledWith(expect.objectContaining({ uid: user.uid }));
  });
  it("if the check can't be made, nothing is deleted", async () => {
    fs.readFails = true;
    await setup();
    await expect(api.deleteMySoloAccount("pw")).rejects.toThrow(/Couldn't delete/);
    expect(fs.deleted).toEqual([]);
    expect(auth.deleteUser).not.toHaveBeenCalled();
  });
});
