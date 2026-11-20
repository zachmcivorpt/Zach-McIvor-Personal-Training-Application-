// #315 (owner): a client may be deleted before the 30-day purge only when
// already archived AND the coach typed their full name; the old
// deleteClientAuthAccount refuses for any client whose profile exists.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { deleteNowRefusal } = require("./clientArchive");

const archived = { role: "client", name: "Rusiru Perera", archivedAt: Date.now() - 1000 };

describe("deleteNowRefusal (#315)", () => {
  it("allows only an archived client with the typed full name", () => {
    expect(deleteNowRefusal(archived, "rusiru  perera ")).toBeNull();
  });
  it("refuses a live (not archived) client even with the right name", () => {
    expect(deleteNowRefusal({ ...archived, archivedAt: undefined }, "Rusiru Perera")).toBe("not-archived");
  });
  it("refuses a wrong, partial or missing name", () => {
    expect(deleteNowRefusal(archived, "Rusiru")).toBe("name-mismatch");
    expect(deleteNowRefusal(archived, "")).toBe("name-mismatch");
    expect(deleteNowRefusal(archived, undefined)).toBe("name-mismatch");
    expect(deleteNowRefusal({ ...archived, name: "" }, "")).toBe("name-mismatch");
  });
  it("refuses the coach and missing profiles", () => {
    expect(deleteNowRefusal({ ...archived, role: "coach" }, "Rusiru Perera")).toBe("not-a-client");
    expect(deleteNowRefusal(null, "x")).toBe("not-found");
  });
});

describe("server wiring (#315)", () => {
  const src = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const fn = (name) => src.slice(src.indexOf(`exports.${name} = onCall`), src.indexOf("\n});", src.indexOf(`exports.${name} = onCall`)));
  it("deleteClientAuthAccount refuses while the client's profile exists, before deleting the login", () => {
    const body = fn("deleteClientAuthAccount");
    expect(body).toMatch(/if \(profile\.exists\)[\s\S]*throw new HttpsError\("failed-precondition"/);
    expect(body.indexOf("profile.exists")).toBeLessThan(body.indexOf("adminAuth.deleteUser"));
  });
  it("deleteArchivedClient checks deleteNowRefusal before purging anything", () => {
    const body = fn("deleteArchivedClient");
    expect(body.indexOf("deleteNowRefusal(")).toBeGreaterThan(-1);
    expect(body.indexOf("if (refusal)")).toBeLessThan(body.indexOf("purgeClientData("));
  });
});

describe("firestore.rules (#315)", () => {
  it("a client's users doc can't be deleted from an app", () => {
    const rules = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");
    const users = rules.slice(rules.indexOf("match /users/{userId}"), rules.indexOf("match /invites/{email}"));
    expect(users).toMatch(/allow delete: if isCoach\(\) &&\s*\(resource == null \|\| resource\.data\.get\("role", ""\) != "client" \|\|/);
    expect(users).not.toMatch(/allow delete: if isCoach\(\);/);
  });
});
