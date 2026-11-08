// #193: the iPhone app's purchase log is copied to the member's own profile
// so a white screen after a purchase can be diagnosed without the member
// sending screenshots of Profile → Purchase log.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/firebase", () => ({ soloDb: {} }));
import { uploadPurchaseTrace, resetPurchaseTraceUploadForTests } from "./purchaseTraceUpload";

beforeEach(() => resetPurchaseTraceUploadForTests());

describe("purchase log upload (#193)", () => {
  it("writes the log to soloUsers/{uid}.purchaseTrace", async () => {
    const write = vi.fn(() => Promise.resolve());
    const lines = ["+0ms Apple's sheet requested from /solo/program/p1", "+5100ms cover off"];
    expect(await uploadPurchaseTrace("u1", { read: () => Promise.resolve(lines), write })).toBe(true);
    expect(write).toHaveBeenCalledWith("u1", { purchaseTrace: { lines, uploadedAt: expect.any(Number) } });
  });

  it("sends a log only once until it changes", async () => {
    const write = vi.fn(() => Promise.resolve());
    let lines = ["+0ms a"];
    const read = () => Promise.resolve(lines);
    await uploadPurchaseTrace("u1", { read, write });
    await uploadPurchaseTrace("u1", { read, write });
    expect(write).toHaveBeenCalledTimes(1);
    lines = ["+0ms a", "+900ms b"];
    await uploadPurchaseTrace("u1", { read, write });
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("does nothing with no log, no user or no app, and never throws", async () => {
    const write = vi.fn(() => Promise.resolve());
    expect(await uploadPurchaseTrace("u1", { read: () => Promise.resolve([]), write })).toBe(false);
    expect(await uploadPurchaseTrace(null, { read: () => Promise.resolve(["x"]), write })).toBe(false);
    expect(await uploadPurchaseTrace("u1", { read: () => Promise.reject(new Error("Unknown purchase request.")), write })).toBe(false);
    expect(await uploadPurchaseTrace("u1", { read: () => Promise.resolve(["x"]), write: () => Promise.reject(new Error("offline")) })).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it("runs from Train Solo in the iPhone app: on open, later, and on coming back to the front", () => {
    const src = readFileSync("src/solo/SoloPaywall.jsx", "utf8");
    expect(src).toMatch(/if \(!traceUid \|\| !inAppPurchasesAvailable\(\)\) return;[\s\S]*uploadPurchaseTrace\(traceUid\)[\s\S]*\[30000, 90000\][\s\S]*visibilitychange/);
  });
});
