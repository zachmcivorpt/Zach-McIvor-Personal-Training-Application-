// @vitest-environment jsdom
//
// Regression: a signed-in Train Solo account whose soloUsers doc was never
// written (registration's profile save failed after the Auth account was
// created) left soloSessionLoading true forever — a permanent blank screen.
// The server-confirmed "doesn't exist" now ends loading and sets
// soloProfileMissing, which RequireSoloAuth turns into the finish-setup
// screen. A cache-only or pending-write "doesn't exist" (an empty cache on
// a new device, the login's own lastLoginAt write), or a server read that
// finds the doc after all, must NOT count as missing — that version sent
// fully set-up customers to the questionnaire on about 1 login in 3.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { SoloAppProvider, useSoloApp } from "./SoloAppContext";

vi.mock("./firebase", () => ({ soloAuth: {}, soloDb: {}, soloFunctions: {} }));
vi.mock("./push", () => ({ removeSoloPushToken: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn() }));
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

let emitProfile = null;
let serverExists = false;
vi.mock("firebase/firestore", () => ({
  doc: (...args) => ({ path: args.slice(1).join("/") }),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  getDocs: vi.fn(),
  getDocFromServer: () => Promise.resolve({ exists: () => serverExists }),
  writeBatch: vi.fn(),
  onSnapshot: (ref, ...rest) => {
    const cb = rest.find((a) => typeof a === "function");
    if (ref?.path === "soloUsers/u1") emitProfile = cb;
    return () => {};
  },
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
}));

afterEach(() => {
  cleanup();
  emitProfile = null;
  serverExists = false;
});

function Probe() {
  const { soloSessionLoading, soloProfileMissing, soloCurrentUser } = useSoloApp();
  return <p>{`loading=${soloSessionLoading} missing=${soloProfileMissing} user=${soloCurrentUser?.id || "none"}`}</p>;
}

const snap = ({ exists, fromCache, pending = false, data = {} }) => ({
  id: "u1",
  exists: () => exists,
  data: () => data,
  metadata: { fromCache, hasPendingWrites: pending },
});

describe("SoloAppContext — missing profile", () => {
  it("keeps loading on a cache-only 'doesn't exist', then flags missing once a server read confirms it", async () => {
    render(<SoloAppProvider><Probe /></SoloAppProvider>);
    expect(emitProfile).toBeTypeOf("function");
    act(() => emitProfile(snap({ exists: false, fromCache: true })));
    expect(screen.getByText("loading=true missing=false user=none")).toBeTruthy();
    act(() => emitProfile(snap({ exists: false, fromCache: false })));
    await waitFor(() => expect(screen.getByText("loading=false missing=true user=none")).toBeTruthy());
  });
  it("never flags missing on a pending-write 'doesn't exist' (the login's own lastLoginAt update)", async () => {
    render(<SoloAppProvider><Probe /></SoloAppProvider>);
    act(() => emitProfile(snap({ exists: false, fromCache: false, pending: true })));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText("loading=true missing=false user=none")).toBeTruthy();
  });
  it("never flags missing when the server read finds the profile after all", async () => {
    serverExists = true;
    render(<SoloAppProvider><Probe /></SoloAppProvider>);
    act(() => emitProfile(snap({ exists: false, fromCache: false })));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText("loading=true missing=false user=none")).toBeTruthy();
  });
  it("clears the flag once the profile is created", async () => {
    render(<SoloAppProvider><Probe /></SoloAppProvider>);
    act(() => emitProfile(snap({ exists: false, fromCache: false })));
    await waitFor(() => expect(screen.getByText("loading=false missing=true user=none")).toBeTruthy());
    act(() => emitProfile(snap({ exists: true, fromCache: false, data: { name: "A" } })));
    expect(screen.getByText("loading=false missing=false user=u1")).toBeTruthy();
  });
});
