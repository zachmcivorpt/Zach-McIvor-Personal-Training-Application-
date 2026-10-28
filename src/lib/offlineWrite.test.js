// @vitest-environment jsdom
// Register #102: finishing a workout with no signal. Firestore's write
// promise only settles once the server answers; offline that's never, so
// "Finish" spun forever. savedOrQueued resolves "queued" after a short wait
// (the write is already kept on the phone and sends itself later).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { savedOrQueued, SAVED, QUEUED } from "./offlineWrite";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("savedOrQueued", () => {
  it("resolves queued when the server never answers (no signal)", async () => {
    const p = savedOrQueued(new Promise(() => {}), { waitMs: 4000 });
    vi.advanceTimersByTime(4000);
    await expect(p).resolves.toBe(QUEUED);
  });

  it("resolves saved when the server answers in time", async () => {
    await expect(savedOrQueued(Promise.resolve(), { waitMs: 4000 })).resolves.toBe(SAVED);
  });

  it("still reports a real failure that comes back in time", async () => {
    await expect(savedOrQueued(Promise.reject(new Error("permission-denied")), { waitMs: 4000 })).rejects.toThrow("permission-denied");
  });

  it("hands a failure that arrives after it moved on to onLateError", async () => {
    let fail;
    const onLateError = vi.fn();
    const p = savedOrQueued(new Promise((_, r) => (fail = r)), { waitMs: 4000, onLateError });
    vi.advanceTimersByTime(4000);
    await expect(p).resolves.toBe(QUEUED);
    fail(new Error("denied later"));
    await Promise.resolve();
    expect(onLateError).toHaveBeenCalledWith(expect.objectContaining({ message: "denied later" }));
  });

  it("waits less when the phone already knows it's offline", async () => {
    const online = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine") ? navigator.onLine : true;
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const p = savedOrQueued(new Promise(() => {}));
    vi.advanceTimersByTime(800);
    await expect(p).resolves.toBe(QUEUED);
    expect(online).toBeDefined();
  });
});
