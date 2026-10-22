// @vitest-environment jsdom
//
// Card is shared: the coached client app gives it a frosted-glass surface
// through CardSurfaceContext, while everywhere else (the coach console)
// keeps the original solid surface.
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Card, CardSurfaceContext } from "./ui";

afterEach(cleanup);

describe("Card surface", () => {
  it("is solid by default (coach console and anywhere without a surface)", () => {
    render(<Card>solid</Card>);
    expect(screen.getByText("solid").style.backgroundColor).not.toContain("0.55");
    expect(screen.getByText("solid").style.backdropFilter).toBe("");
  });
  it("uses the provided glass surface inside the client app", () => {
    render(
      <CardSurfaceContext.Provider value={{ backgroundColor: "rgba(28,28,30,0.55)", backdropFilter: "blur(18px)" }}>
        <Card dark>glass</Card>
      </CardSurfaceContext.Provider>
    );
    expect(screen.getByText("glass").style.backgroundColor).toBe("rgba(28, 28, 30, 0.55)");
    expect(screen.getByText("glass").style.backdropFilter).toBe("blur(18px)");
  });
});
