// #162: the coach's welcome message. The automatic one (sent when a client
// activates) was written from the client's own session as from:"coach",
// which firestore.rules refuses — so it never arrived. It is now sent by the
// server, once ever per client (fixed id + create()).
import { describe, expect, it, vi } from "vitest";

vi.mock("../api-lib/firebaseAdmin.js", () => ({ getDb: vi.fn(), requireUid: vi.fn() }));
vi.mock("../api-lib/notify.js", () => ({ CLIENT_ID_COLLECTIONS: [] }));

import { sendWelcomeOnce } from "./client-activated.js";

function fakeDb({ user, welcome }) {
  const messages = new Map();
  const doc = (col, id) => ({
    get: async () => {
      const data = col === "users" ? user : col === "settings" && id === "welcomeMessage" ? welcome : messages.get(id);
      return { exists: !!data, data: () => data };
    },
    create: async (data) => {
      if (col !== "messages") throw new Error("unexpected");
      if (messages.has(id)) {
        const err = new Error("6 ALREADY_EXISTS: Document already exists");
        err.code = 6;
        throw err;
      }
      messages.set(id, data);
    },
  });
  return { messages, collection: (col) => ({ doc: (id) => doc(col, id) }) };
}
const welcome = { autoSend: true, text: "Hi {name},\n\nWelcome to the app!", attachmentUrl: "https://x/manual.pdf", attachmentName: "Manual.pdf" };

describe("sendWelcomeOnce (#162)", () => {
  it("sends the coach's welcome to a newly activated client, from the coach, with the first name and attachment", async () => {
    const db = fakeDb({ user: { role: "client", name: "Rusiru Herath" }, welcome });
    expect(await sendWelcomeOnce(db, "u1")).toBe(true);
    const msg = db.messages.get("welcome_u1");
    expect(msg).toMatchObject({ id: "welcome_u1", clientId: "u1", from: "coach", kind: "welcome", text: "Hi Rusiru,\n\nWelcome to the app!" });
    expect(msg.attachment).toEqual({ name: "Manual.pdf", url: "https://x/manual.pdf" });
  });
  it("never twice for the same client (a retry or a second call)", async () => {
    const db = fakeDb({ user: { role: "client", name: "Rusiru" }, welcome });
    await sendWelcomeOnce(db, "u1");
    expect(await sendWelcomeOnce(db, "u1")).toBe(false);
    expect(db.messages.size).toBe(1);
  });
  it("only for client accounts, and only when auto-send is on with text", async () => {
    expect(await sendWelcomeOnce(fakeDb({ user: { role: "coach", name: "Zach" }, welcome }), "c1")).toBe(false);
    expect(await sendWelcomeOnce(fakeDb({ user: null, welcome }), "x")).toBe(false);
    expect(await sendWelcomeOnce(fakeDb({ user: { role: "client", name: "A" }, welcome: { ...welcome, autoSend: false } }), "u")).toBe(false);
    expect(await sendWelcomeOnce(fakeDb({ user: { role: "client", name: "A" }, welcome: { autoSend: true, text: "  " } }), "u")).toBe(false);
  });
});
