// @vitest-environment jsdom
//
// Regression: after a real refund, the program stayed in My Training —
// soloStripeWebhook marked the purchase refunded: true (and firestore.rules
// locked its content), but the app's purchase list never left it out.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
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

let emitPurchases = null;
vi.mock("firebase/firestore", () => ({
  doc: (...args) => ({ path: args.slice(1).join("/") }),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  getDocs: vi.fn(),
  getDocFromServer: () => Promise.resolve({ exists: () => true }),
  writeBatch: vi.fn(),
  collection: (_db, name) => ({ collection: name }),
  query: (ref) => ref,
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: (ref, ...rest) => {
    const cb = rest.find((a) => typeof a === "function");
    if (ref?.collection === "soloPurchases") emitPurchases = cb;
    return () => {};
  },
}));

afterEach(cleanup);

function Probe() {
  const { soloPurchases } = useSoloApp();
  return <p>{`owned=${soloPurchases.map((p) => p.programId).join(",") || "none"}`}</p>;
}

const docs = (list) => ({ docs: list.map((d) => ({ id: d.id, data: () => d })) });

describe("SoloAppContext — refunded purchases", () => {
  it("leaves a refunded purchase out of the owned list, keeps the rest", () => {
    render(<SoloAppProvider><Probe /></SoloAppProvider>);
    act(() =>
      emitPurchases(
        docs([
          { id: "u1_a", soloUserId: "u1", programId: "a", refunded: false },
          { id: "u1_b", soloUserId: "u1", programId: "b", refunded: true },
          { id: "u1_c", soloUserId: "u1", programId: "c" }, // older purchase with no refunded field
        ])
      )
    );
    expect(screen.getByText("owned=a,c")).toBeTruthy();
  });
});
