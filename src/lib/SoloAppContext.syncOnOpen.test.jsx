// @vitest-environment jsdom
//
// #133: after buying Plus in the iPhone app the page was dropped under
// Apple's sheet, so the "purchase done" reply (and the re-read it
// triggers) never happened and the account stayed Free. Now every open of
// the iPhone app asks the server to re-read the App Store once.
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { SoloAppProvider } from "./SoloAppContext";

vi.mock("./firebase", () => ({ soloAuth: {}, soloDb: {}, soloFunctions: {} }));
vi.mock("./push", () => ({ removeSoloPushToken: vi.fn() }));
const calls = vi.hoisted(() => ({ names: [] }));
vi.mock("firebase/functions", () => ({ httpsCallable: (_f, name) => () => (calls.names.push(name), Promise.resolve({ data: { tier: "plus" } })) }));
vi.mock("./purchases", () => ({ inAppPurchasesAvailable: () => true, identifyPurchaser: vi.fn(() => Promise.resolve()), forgetPurchaser: vi.fn() }));
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


describe("iPhone app: subscription re-read on open (#133)", () => {
  it("asks the server to sync the App Store subscription once the account is signed in", async () => {
    render(<SoloAppProvider><p>app</p></SoloAppProvider>);
    await waitFor(() => expect(calls.names).toContain("syncSoloEntitlement"));
    expect(calls.names.filter((n) => n === "syncSoloEntitlement")).toHaveLength(1);
  });
});
