// @vitest-environment jsdom
//
// #137: on every open a paying member was treated as Free until their
// soloEntitlements doc arrived — Program Builder opened the paywall and
// All Access programs flashed locked. The phone now keeps the last
// confirmed entitlement for the account and starts from it.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { SoloAppProvider, useSoloApp } from "./SoloAppContext";

vi.mock("./firebase", () => ({ soloAuth: {}, soloDb: {}, soloFunctions: {} }));
vi.mock("./push", () => ({ removeSoloPushToken: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => () => Promise.resolve({ data: {} }) }));
vi.mock("./purchases", () => ({ inAppPurchasesAvailable: () => false, identifyPurchaser: vi.fn(), forgetPurchaser: vi.fn() }));
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

const listeners = vi.hoisted(() => ({}));
vi.mock("firebase/firestore", () => ({
  doc: (...args) => ({ path: args.slice(1).join("/") }),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  getDocs: vi.fn(),
  getDocFromServer: () => Promise.resolve({ exists: () => true }),
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

const FUTURE = Date.now() + 30 * 86_400_000;
const plus = { sources: { apple: { tier: "plus", status: "active", expiresAt: FUTURE } } };
const allAccess = { sources: { apple: { tier: "all_access", status: "active", expiresAt: FUTURE } } };
const snap = (data, fromCache = false) => ({ exists: () => !!data, data: () => data, metadata: { fromCache } });

function Probe() {
  const { soloTier, soloEntitlementReady } = useSoloApp();
  return <p data-testid="probe">{`${soloTier}|${soloEntitlementReady}`}</p>;
}
const probe = () => screen.getByTestId("probe").textContent;

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  for (const k of Object.keys(listeners)) delete listeners[k];
});

describe("Train Solo entitlement on open (#137)", () => {
  it("a member's last confirmed plan applies straight away, before the server answers", () => {
    localStorage.setItem("apexSoloEntitlement", JSON.stringify({ uid: "u1", data: plus }));
    render(<SoloAppProvider><Probe /></SoloAppProvider>);
    expect(probe()).toBe("plus|true");
  });

  it("with nothing saved it waits (not ready), then takes the server's plan and remembers it", async () => {
    render(<SoloAppProvider><Probe /></SoloAppProvider>);
    expect(probe()).toBe("free|false");
    // An empty answer from the phone's own Firestore cache isn't an answer.
    act(() => listeners["soloEntitlements/u1"](snap(null, true)));
    expect(probe()).toBe("free|false");
    act(() => listeners["soloEntitlements/u1"](snap(allAccess)));
    expect(probe()).toBe("all_access|true");
    expect(JSON.parse(localStorage.getItem("apexSoloEntitlement"))).toMatchObject({ uid: "u1", data: { sources: { apple: { tier: "all_access" } } } });
  });

  it("the server's answer replaces the saved copy (a lapsed plan is Free at once)", async () => {
    localStorage.setItem("apexSoloEntitlement", JSON.stringify({ uid: "u1", data: allAccess }));
    render(<SoloAppProvider><Probe /></SoloAppProvider>);
    expect(probe()).toBe("all_access|true");
    act(() => listeners["soloEntitlements/u1"](snap({ sources: { apple: { tier: "all_access", status: "expired", expiresAt: Date.now() - 1 } } })));
    expect(probe()).toBe("free|true");
    await waitFor(() => expect(JSON.parse(localStorage.getItem("apexSoloEntitlement")).data.sources.apple.status).toBe("expired"));
  });

  it("another account's saved plan is never used; an expired saved plan is Free", () => {
    localStorage.setItem("apexSoloEntitlement", JSON.stringify({ uid: "someone-else", data: allAccess }));
    const { unmount } = render(<SoloAppProvider><Probe /></SoloAppProvider>);
    expect(probe()).toBe("free|false");
    unmount();
    localStorage.setItem("apexSoloEntitlement", JSON.stringify({ uid: "u1", data: { sources: { apple: { tier: "plus", status: "active", expiresAt: Date.now() - 1000 } } } }));
    render(<SoloAppProvider><Probe /></SoloAppProvider>);
    expect(probe()).toBe("free|true");
  });
});
