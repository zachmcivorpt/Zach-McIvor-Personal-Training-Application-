// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const NEW_UPLOAD = "https://firebasestorage.googleapis.com/v0/b/b/o/design%2FappLogoUrlOnDark_5_new.png?alt=media&token=t";
vi.mock("../lib/AppContext", () => ({ useApp: () => ({ db: { appDesign: { appLogoUrlOnDark: NEW_UPLOAD, appLogoUrlOnLight: null } } }) }));

import { Logo } from "./ui";

afterEach(cleanup);

// A logo that fails to load (offline, a deleted upload) shows the default
// mark instead of a broken-image icon.
describe("Logo", () => {
  it("shows the uploaded logo, falling back to the default mark if it fails to load", () => {
    render(<Logo variant="mark" tone="white" />);
    const img = screen.getByAltText("APEX Coaching Platform");
    expect(img.getAttribute("src")).toBe(NEW_UPLOAD);
    fireEvent.error(img);
    expect(img.getAttribute("src")).toBe("/brand/mark-white.png");
  });
});
