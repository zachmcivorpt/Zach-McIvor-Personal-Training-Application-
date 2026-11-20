// #313: archived clients are deleted for good only after 30 days.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { ARCHIVE_DAYS, isArchiveExpired } = require("./clientArchive");
const DAY = 86400000;
const now = Date.UTC(2026, 10, 20);

describe("isArchiveExpired (#313)", () => {
  it("keeps an archived client for 30 days", () => {
    expect(ARCHIVE_DAYS).toBe(30);
    expect(isArchiveExpired({ role: "client", archivedAt: now - 29 * DAY }, now)).toBe(false);
    expect(isArchiveExpired({ role: "client", archivedAt: now - 30 * DAY }, now)).toBe(true);
  });
  it("never touches a client who isn't archived, or the coach", () => {
    expect(isArchiveExpired({ role: "client" }, now)).toBe(false);
    expect(isArchiveExpired({ role: "coach", archivedAt: now - 99 * DAY }, now)).toBe(false);
  });
  it("the daily purge uses it and deletes with the same code as Delete account", () => {
    const src = fs.readFileSync(new URL("./index.js", import.meta.url), "utf8");
    const start = src.indexOf("exports.purgeArchivedClients = onSchedule(");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf("\n);\n", start));
    expect(body).toContain("isArchiveExpired(d.data())");
    expect(body).toContain("purgeClientData(d.id)");
  });
});
