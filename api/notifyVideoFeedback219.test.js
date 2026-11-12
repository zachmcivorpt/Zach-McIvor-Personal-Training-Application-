// #219: the client is told their video feedback is ready — only when the
// coach asks (a client can't trigger it), only for a real published doc,
// and to that doc's own client.
import { describe, expect, it, vi } from "vitest";

const notifyUser = vi.fn();
const getCoachId = vi.fn().mockResolvedValue("coach-1");
let caller = "coach-1";
vi.mock("../api-lib/firebaseAdmin.js", () => ({
  getDb: () => mockDb,
  getMessagingClient: () => ({}),
  requireUid: vi.fn(async () => caller),
}));
vi.mock("../api-lib/notify.js", () => ({ notifyUser, getCoachId }));

let fixtures = {};
const mockDb = {
  collection: (name) => ({ doc: (id) => ({ get: async () => ({ exists: !!fixtures[name]?.[id], data: () => fixtures[name]?.[id] }) }) }),
};
const res = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });

describe("POST /api/notify — kind: videoFeedback (#219)", () => {
  it("notifies the feedback's own client when the coach publishes", async () => {
    const { default: handler } = await import("./notify.js");
    notifyUser.mockClear();
    caller = "coach-1";
    fixtures = { videoFeedback: { vf1: { clientId: "client-a" } } };
    const r = res();
    await handler({ method: "POST", headers: {}, body: { kind: "videoFeedback", id: "vf1" } }, r);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(notifyUser).toHaveBeenCalledTimes(1);
    const [, , uid, payload, pref] = notifyUser.mock.calls[0];
    expect(uid).toBe("client-a");
    expect(payload.title).toBe("Your weekly feedback is ready");
    expect(pref).toBe("checkins");
  });

  it("says 'updated' for a replaced video", async () => {
    const { default: handler } = await import("./notify.js");
    notifyUser.mockClear();
    caller = "coach-1";
    fixtures = { videoFeedback: { vf1: { clientId: "client-a" } } };
    await handler({ method: "POST", headers: {}, body: { kind: "videoFeedback", id: "vf1", update: true } }, res());
    expect(notifyUser.mock.calls[0][3].title).toBe("Your coach updated your feedback");
  });

  it("ignores a client (or anyone not the coach) and docs that don't exist", async () => {
    const { default: handler } = await import("./notify.js");
    notifyUser.mockClear();
    caller = "client-a";
    fixtures = { videoFeedback: { vf1: { clientId: "client-b" } } };
    await handler({ method: "POST", headers: {}, body: { kind: "videoFeedback", id: "vf1" } }, res());
    caller = "coach-1";
    await handler({ method: "POST", headers: {}, body: { kind: "videoFeedback", id: "missing" } }, res());
    expect(notifyUser).not.toHaveBeenCalled();
  });
});
