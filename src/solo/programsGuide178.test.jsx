import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("How your programs work (#178)", () => {
  const src = readFileSync(new URL("./SoloProgramSwitch.jsx", import.meta.url), "utf8");
  it("advises completing one program fully for the best results", () => {
    expect(src).toMatch(/For the best results, complete one program fully before starting the next\./);
  });
  it("tells them sessions can be moved to another day in Calendar", () => {
    expect(src).toMatch(/In Calendar, hold a session and drag it to the day that suits you\./);
  });
});
