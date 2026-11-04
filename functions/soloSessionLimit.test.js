// #159: Free's 3 saved sessions enforced on the server.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { sessionOverFreeLimit, FREE_SAVED_SESSIONS } = require("./soloSessionLimit.js");

const NOW = 1_800_000_000_000;
const live = { live: true };
const s = (id, createdAt) => ({ id, createdAt });
const four = [s("a", 1), s("b", 2), s("c", 3), s("d", 4)];

describe("sessionOverFreeLimit", () => {
  it("matches the app's limit", () => {
    expect(FREE_SAVED_SESSIONS).toBe(3);
  });
  it("a Free member's 4th session is removed once live", () => {
    expect(sessionOverFreeLimit({ monetisation: live, entitlement: {}, uid: "u", sessions: four, newId: "d", now: NOW })).toBe(true);
  });
  it("the first three are always kept", () => {
    for (const id of ["a", "b", "c"]) expect(sessionOverFreeLimit({ monetisation: live, entitlement: {}, uid: "u", sessions: four, newId: id, now: NOW })).toBe(false);
  });
  it("several synced at once (offline): the oldest three stay, only the extra goes — whichever trigger runs first", () => {
    const burst = [s("x3", 30), s("x1", 10), s("x4", 40), s("x2", 20)];
    const removed = burst.filter((b) => sessionOverFreeLimit({ monetisation: live, entitlement: {}, uid: "u", sessions: burst, newId: b.id, now: NOW })).map((b) => b.id);
    expect(removed).toEqual(["x4"]);
  });
  it("Plus or All Access paid up: no limit", () => {
    expect(sessionOverFreeLimit({ monetisation: live, entitlement: { plusUntil: NOW + 1 }, uid: "u", sessions: four, newId: "d", now: NOW })).toBe(false);
  });
  it("a lapsed member keeps what they made but can't add more", () => {
    const many = Array.from({ length: 8 }, (_, i) => s(`o${i}`, i));
    for (let i = 0; i < 7; i++) expect(sessionOverFreeLimit({ monetisation: live, entitlement: { plusUntil: NOW - 1 }, uid: "u", sessions: many, newId: `o${i}`, now: NOW })).toBe(i >= 3);
  });
  it("before launch nothing is removed; a test account is limited before launch", () => {
    expect(sessionOverFreeLimit({ monetisation: {}, entitlement: {}, uid: "u", sessions: four, newId: "d", now: NOW })).toBe(false);
    expect(sessionOverFreeLimit({ monetisation: { live: false, testUids: ["u"] }, entitlement: {}, uid: "u", sessions: four, newId: "d", now: NOW })).toBe(true);
  });
  it("three or fewer: nothing removed", () => {
    expect(sessionOverFreeLimit({ monetisation: live, entitlement: {}, uid: "u", sessions: four.slice(0, 3), newId: "c", now: NOW })).toBe(false);
  });
});
