// #204: the muscle card has no exercise or credit lines; the model's credit
// (CC BY 4.0) stays on Profile.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const src = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
describe("muscle card (#204)", () => {
  it("card without exercises or credit; credit on Profile", () => {
    const map = src("./SoloMuscleMap.jsx");
    expect(map).not.toMatch(/detail\.exercises\.join/);
    expect(map).not.toMatch(/Anatomy: BodyParts3D/);
    expect(src("./SoloProfileScreen.jsx")).toMatch(/Z-Anatomy \(CC BY-SA 4\.0\), based on BodyParts3D © DBCLS/);
  });
});
