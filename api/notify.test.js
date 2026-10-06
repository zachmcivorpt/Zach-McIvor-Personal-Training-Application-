// Regression coverage for the coach's push notification showing a
// generic "New message" title with no indication of which client sent
// it — reported directly by the user from a real push banner. The
// `messages` doc itself only ever carries clientId, not a name, so the
// fix looks the client's name up from their profile doc before
// notifying the coach.
import { describe, expect, it, vi } from "vitest";

const notifyUser = vi.fn();
const getCoachId = vi.fn().mockResolvedValue("coach-1");

vi.mock("../api-lib/firebaseAdmin.js", () => ({
  getDb: () => mockDb,
  getMessagingClient: () => ({}),
  requireUid: vi.fn().mockResolvedValue("coach-1"),
}));
vi.mock("../api-lib/notify.js", () => ({ notifyUser, getCoachId }));

// A tiny fake Firestore: collection(name).doc(id).get() resolves from a
// plain { [collection]: { [id]: data } } lookup table set per test.
let fixtures = {};
const mockDb = {
  collection: (name) => ({
    doc: (id) => ({
      get: async () => ({
        exists: !!fixtures[name]?.[id],
        data: () => fixtures[name]?.[id],
      }),
    }),
  }),
};

function mockRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() };
}

describe("POST /api/notify — kind: message, from a client", () => {
  it("uses the client's real name as the push title, not a generic 'New message'", async () => {
    const { default: handler } = await import("./notify.js");
    notifyUser.mockClear();
    fixtures = {
      messages: { "msg-1": { from: "client", clientId: "client-a", text: "hey mate. sometimes app doesn't record foods entered" } },
      users: { "client-a": { name: "Zach Test", role: "client" } },
    };

    const req = { method: "POST", headers: { authorization: "Bearer x" }, body: { kind: "message", id: "msg-1" } };
    const res = mockRes();
    await handler(req, res);

    expect(notifyUser).toHaveBeenCalledTimes(1);
    const [, , uid, payload, prefKey] = notifyUser.mock.calls[0];
    expect(uid).toBe("coach-1");
    expect(payload.title).toBe("Zach Test");
    expect(payload.body).toContain("sometimes app doesn't record");
    expect(prefKey).toBe("messages");
  });

  it("falls back to a generic label if the client's profile has no name on it", async () => {
    const { default: handler } = await import("./notify.js");
    notifyUser.mockClear();
    fixtures = {
      messages: { "msg-2": { from: "client", clientId: "client-b", text: "hi" } },
      users: { "client-b": {} },
    };

    const req = { method: "POST", headers: { authorization: "Bearer x" }, body: { kind: "message", id: "msg-2" } };
    await handler(req, mockRes());

    expect(notifyUser.mock.calls[0][3].title).toBe("A client");
  });
});
