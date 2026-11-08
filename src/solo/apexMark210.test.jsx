// @vitest-environment jsdom
// #210: the login area's APEX mark is a vector (sharp at any size) with a
// tight SVG glow — owner picked mock-up B.
import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ApexMarkSvg, GlowLogo, LitLogo } from "../components/LoginHero";

describe("vector APEX mark (#210)", () => {
  it("draws the two mountain shapes in white with a tight glow", () => {
    const { container } = render(<ApexMarkSvg width={200} />);
    expect(container.querySelectorAll("path")).toHaveLength(2);
    expect(container.querySelector("g").getAttribute("fill")).toBe("#fff");
    expect(container.querySelector("feGaussianBlur").getAttribute("stdDeviation")).toBe("3.8");
  });
  it("chooser, log-in screens and the first page all use it, never an image", () => {
    const lit = render(<LitLogo width={104} crisp />);
    expect(lit.container.querySelector("[data-testid=apex-mark-svg]")).not.toBeNull();
    expect(lit.container.querySelector("img")).toBeNull();
    const first = render(<GlowLogo width={250} />);
    expect(first.container.querySelector("[data-testid=apex-mark-svg]")).not.toBeNull();
    expect(first.container.querySelector("img")).toBeNull();
  });
  it("two marks on one screen don't share a filter id", () => {
    const { container } = render(<><ApexMarkSvg width={50} /><ApexMarkSvg width={50} /></>);
    const ids = [...container.querySelectorAll("filter")].map((f) => f.id);
    expect(new Set(ids).size).toBe(2);
  });
});
