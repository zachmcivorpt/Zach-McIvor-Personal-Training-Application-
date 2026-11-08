// #198: the 3D muscle map follows Train Solo's light mode.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const src = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

describe("3D muscle map light mode (#198)", () => {
  it("the panel picks its light palette from the theme and rebuilds the body for it", () => {
    const s = src("./SoloMuscleMap.jsx");
    expect(s).toMatch(/const HOLO = dark \? HOLO_DARK : HOLO_LIGHT;/);
    expect(s).toMatch(/HOLO_LIGHT = \{\s*bg: "#F3F6FA",\s*text: "#0A0A0B"/);
    expect(s).toMatch(/<MuscleHologram key=\{dark \? "dark" : "light"\} light=\{!dark\}/);
    expect(s).toMatch(/onUnavailable=\{\(\) => setThreeD\(false\)\}\s*dark=\{dark\}/);
  });
  it("the light body is drawn normally (not added light, which vanishes on white)", () => {
    const h = src("./MuscleHologram.jsx");
    expect(h).toMatch(/new THREE\.Mesh\(g, light \? lightMaterial : material\)/);
    expect(h).toMatch(/blending: light \? THREE\.NormalBlending : THREE\.AdditiveBlending/);
    const lightShader = h.slice(h.indexOf("const lightMaterial"), h.indexOf("const ghostMat"));
    expect(lightShader).not.toMatch(/AdditiveBlending/);
  });
});
