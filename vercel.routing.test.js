// Regression coverage for the stale-chunk-masked-as-HTML production bug
// ("Importing a module script failed" / index-DhhbY1Lj.js): vercel.json's
// SPA catch-all rewrite must never apply to /assets/* paths, or a deleted
// hashed chunk from an old deploy gets silently served as a 200 index.html
// instead of a genuine 404 — which is what turns a stale dynamic import()
// into an unrecoverable "parse this HTML as JS" crash.
//
// This mirrors the exact anchoring/compilation Vercel's own
// @vercel/routing-utils applies to a rewrite's "source" (verified directly
// against that package: `^(?:${source})$`, with "/" escaped only to avoid
// colliding with its own regex-literal delimiters — not a behavioral
// difference here) so this test reflects real Vercel routing semantics,
// not just a hand-rolled approximation.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function vercelSourceToRegex(source) {
  return new RegExp(`^(?:${source})$`);
}

const vercelConfig = JSON.parse(readFileSync(new URL("./vercel.json", import.meta.url)));

describe("vercel.json SPA rewrite", () => {
  it("has exactly one rewrite rule and no conflicting redirects/cleanUrls", () => {
    expect(vercelConfig.rewrites).toHaveLength(1);
    expect(vercelConfig.redirects).toBeUndefined();
    expect(vercelConfig.cleanUrls).toBeUndefined();
    expect(vercelConfig.trailingSlash).toBeUndefined();
  });

  // Headers never change routing; the only ones allowed are long-lived
  // Cache-Control on content-hashed /assets/* files and the versioned login
  // background (warm start — see the vercel.json commit). index.html and
  // sw.js must NOT be covered, or new deploys would stop being picked up.
  it("only adds Cache-Control headers, and only for hashed/versioned static files", () => {
    for (const rule of vercelConfig.headers || []) {
      expect(rule.headers.map((h) => h.key)).toEqual(["Cache-Control"]);
      const regex = vercelSourceToRegex(rule.source);
      for (const path of ["/", "/index.html", "/sw.js", "/login", "/solo/home", "/manifest.webmanifest"]) {
        expect(regex.test(path)).toBe(false);
      }
    }
  });

  it("does NOT rewrite /assets/* — a missing hashed chunk must 404, never fall back to index.html", () => {
    const regex = vercelSourceToRegex(vercelConfig.rewrites[0].source);
    expect(regex.test("/assets/index-DhhbY1Lj.js")).toBe(false);
    expect(regex.test("/assets/ClientApp-C3DrU6bm.js")).toBe(false);
    expect(regex.test("/assets/index-Dqxk97IQ.css")).toBe(false);
    expect(regex.test("/assets/any-future-hash-whatsoever.js")).toBe(false);
  });

  it("still rewrites every real SPA route to index.html", () => {
    const regex = vercelSourceToRegex(vercelConfig.rewrites[0].source);
    for (const path of [
      "/",
      "/login",
      "/activate",
      "/legal/privacy-policy",
      "/app",
      "/app/nutrition",
      "/app/training",
      "/coach",
      "/coach/clients/abc123",
    ]) {
      expect(regex.test(path)).toBe(true);
    }
  });
});
