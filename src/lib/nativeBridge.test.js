// @vitest-environment jsdom
//
// Regression coverage for the push-token cross-account leak: nativeBridge.js
// used to write the native push token to a single bare "pushToken" key, so
// whichever client signed in next on the same device inherited the
// previous client's token and silently had push notifications routed to
// (and controllable from) someone else's account. The fix namespaces the
// key per-uid (`pushToken_${uid}`) — these tests lock that in by stubbing
// out the real Firebase SDK/push module (this file has no need to talk to
// a real backend) and driving the module's actual auth-state + native
// callback wiring.
import { beforeEach, describe, expect, it, vi } from "vitest";

const authStateCallbacks = [];
const saveNativeFcmToken = vi.fn();

vi.mock("firebase/auth", () => ({
  getAuth: () => ({}),
  onAuthStateChanged: (_auth, cb) => {
    authStateCallbacks.push(cb);
    return () => {};
  },
}));

vi.mock("./push", () => ({ saveNativeFcmToken }));

function fireAuthChange(user) {
  authStateCallbacks.forEach((cb) => cb(user));
}

describe("nativeBridge push token isolation", () => {
  beforeEach(() => {
    vi.resetModules();
    authStateCallbacks.length = 0;
    saveNativeFcmToken.mockClear();
    localStorage.clear();
  });

  it("namespaces the stored token per-uid, not under a bare shared key", async () => {
    await import("./nativeBridge.js");
    fireAuthChange({ uid: "client-a" });

    window.__apexNativePush.setToken("token-for-a");

    expect(localStorage.getItem("pushToken_client-a")).toBe("token-for-a");
    expect(localStorage.getItem("pushToken")).toBeNull();
    expect(saveNativeFcmToken).toHaveBeenCalledWith("client-a", "token-for-a");
  });

  it("does not leak one client's token onto the next client signed in on the same device", async () => {
    await import("./nativeBridge.js");

    fireAuthChange({ uid: "client-a" });
    window.__apexNativePush.setToken("token-for-a");

    fireAuthChange({ uid: "client-b" });
    window.__apexNativePush.setToken("token-for-b");

    expect(localStorage.getItem("pushToken_client-a")).toBe("token-for-a");
    expect(localStorage.getItem("pushToken_client-b")).toBe("token-for-b");
  });

  it("holds a token that arrives before auth resolves, then registers it once a user is known", async () => {
    await import("./nativeBridge.js");

    // Native can call setToken on launch before onAuthStateChanged has
    // fired at all yet — must not throw or drop the token.
    window.__apexNativePush.setToken("early-token");
    expect(saveNativeFcmToken).not.toHaveBeenCalled();

    fireAuthChange({ uid: "client-a" });

    expect(localStorage.getItem("pushToken_client-a")).toBe("early-token");
    expect(saveNativeFcmToken).toHaveBeenCalledWith("client-a", "early-token");
  });

  it("ignores an empty/missing token", async () => {
    await import("./nativeBridge.js");
    fireAuthChange({ uid: "client-a" });
    window.__apexNativePush.setToken(null);
    window.__apexNativePush.setToken("");
    expect(saveNativeFcmToken).not.toHaveBeenCalled();
  });
});
