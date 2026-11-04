// @vitest-environment jsdom
//
// #165: every Train Solo open waited ~0.8 s after sign-in for Firestore's
// on-phone database to hand over the profile, behind a black screen. The
// phone now keeps the member's last profile (uid-checked) and shows it the
// moment sign-in is confirmed; the listener replaces it.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { SoloAppProvider, useSoloApp } from "./SoloAppContext";

vi.mock("./firebase", () => ({ soloAuth: {}, soloDb: {}, soloFunctions: {} }));
vi.mock("./push", () => ({ removeSoloPushToken: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => () => Promise.resolve({ data: {} }) }));
vi.mock("./purchases", () => ({ inAppPurchasesAvailable: () => false, identifyPurchaser: vi.fn(), forgetPurchaser: vi.fn() }));
const authState = vi.hoisted(() => ({ cb: null, user: { uid: "u1", email: "u1@example.invalid" } }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth, cb) => {
    authState.cb = cb;
    cb(authState.user);
    return () => {};
  },
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  EmailAuthProvider: { credential: vi.fn() },
  reauthenticateWithCredential: vi.fn(),
  deleteUser: vi.fn(),
}));
const listeners = vi.hoisted(() => ({}));
const serverRead = vi.hoisted(() => ({ exists: true }));
vi.mock("firebase/firestore", () => ({
  doc: (...args) => ({ path: args.slice(1).join("/") }),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  getDocs: vi.fn(),
  getDocFromServer: () => Promise.resolve({ exists: () => serverRead.exists }),
  writeBatch: vi.fn(),
  onSnapshot: (ref, ...rest) => {
    const cb = rest.find((a) => typeof a === "function");
    if (ref?.path) listeners[ref.path] = cb;
    return () => {};
  },
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
}));

const snap = (data, { fromCache = false } = {}) => ({ id: "u1", exists: () => !!data, data: () => data, metadata: { fromCache, hasPendingWrites: false } });
function Probe() {
  const { soloSessionLoading, soloCurrentUser } = useSoloApp();
  return <p data-testid="probe">{soloSessionLoading ? "loading" : soloCurrentUser?.name || "none"}</p>;
}
const probe = () => screen.getByTestId("probe").textContent;
const saved = () => JSON.parse(localStorage.getItem("apexSoloProfile") || "null");

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  authState.user = { uid: "u1", email: "u1@example.invalid" };
  serverRead.exists = true;
  for (const k of Object.keys(listeners)) delete listeners[k];
});

describe("Train Solo profile on open (#165)", () => {
  it("this phone's copy shows the moment sign-in is confirmed, then the listener replaces it", () => {
    localStorage.setItem("apexSoloProfile", JSON.stringify({ uid: "u1", profile: { id: "u1", name: "Saved" } }));
    render(<SoloAppProvider><Probe /></SoloAppProvider>);
    expect(probe()).toBe("Saved");
    act(() => listeners["soloUsers/u1"](snap({ name: "Fresh" })));
    expect(probe()).toBe("Fresh");
    expect(saved()).toEqual({ uid: "u1", profile: { id: "u1", name: "Fresh" } });
  });

  it("with no copy it waits for Firestore (as before), then keeps one", () => {
    render(<SoloAppProvider><Probe /></SoloAppProvider>);
    expect(probe()).toBe("loading");
    act(() => listeners["soloUsers/u1"](snap({ name: "Fresh", createdAt: 5, at: { toMillis: () => 99 } })));
    expect(probe()).toBe("Fresh");
    expect(saved().profile).toEqual({ id: "u1", name: "Fresh", createdAt: 5, at: 99 });
  });

  it("another account's copy is never used", () => {
    localStorage.setItem("apexSoloProfile", JSON.stringify({ uid: "someone-else", profile: { id: "someone-else", name: "Other" } }));
    render(<SoloAppProvider><Probe /></SoloAppProvider>);
    expect(probe()).toBe("loading");
  });

  it("an empty answer from Firestore's on-phone copy doesn't wipe it; the server's 'gone' does", async () => {
    localStorage.setItem("apexSoloProfile", JSON.stringify({ uid: "u1", profile: { id: "u1", name: "Saved" } }));
    serverRead.exists = false;
    render(<SoloAppProvider><Probe /></SoloAppProvider>);
    act(() => listeners["soloUsers/u1"](snap(null, { fromCache: true })));
    expect(probe()).toBe("Saved");
    await act(async () => listeners["soloUsers/u1"](snap(null)));
    expect(saved()).toBe(null);
    expect(probe()).not.toBe("Saved");
  });

  it("signing out removes it", () => {
    localStorage.setItem("apexSoloProfile", JSON.stringify({ uid: "u1", profile: { id: "u1", name: "Saved" } }));
    render(<SoloAppProvider><Probe /></SoloAppProvider>);
    act(() => authState.cb(null));
    expect(saved()).toBe(null);
    expect(probe()).toBe("none");
  });
});
