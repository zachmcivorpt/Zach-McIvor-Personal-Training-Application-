// @vitest-environment jsdom
//
// The logo never flashes a wrong one: nothing shows until the SERVER
// confirms the current logos (a cache snapshot may hold a replaced logo)
// and the image has loaded; a failed upload falls back to the default
// mark.
import React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

let emit = null;
vi.mock("../lib/firebase", () => ({ db: {}, firebaseApp: { options: { projectId: "p", apiKey: "k" } } }));
vi.mock("firebase/firestore", () => ({
  doc: () => ({}),
  onSnapshot: (_ref, _opts, cb) => {
    emit = cb;
    return () => {};
  },
}));

const OLD = "https://firebasestorage.googleapis.com/v0/b/b/o/design%2FappLogoUrlOnDark_1_old.png?alt=media";
const NEW = "https://firebasestorage.googleapis.com/v0/b/b/o/design%2FappLogoUrlOnDark_2_new.png?alt=media";
const BROKEN = "https://firebasestorage.googleapis.com/v0/b/b/o/design%2FappLogoUrlOnDark_3_broken.png?alt=media";

// jsdom never loads images — simulate: everything loads except BROKEN.
class FakeImage {
  set src(v) {
    setTimeout(() => (v === BROKEN ? this.onerror?.() : this.onload?.()), 0);
  }
}

import { Logo } from "./ui";
import { __resetAppLogosForTest } from "../lib/appLogo";

const snap = (data, fromCache) => ({ exists: () => true, data: () => data, metadata: { fromCache } });
const flush = () => act(() => new Promise((r) => setTimeout(r, 5)));
const img = () => screen.getByAltText("APEX Coaching Platform");
const visibleSrc = () => (img().style.opacity === "0" ? null : img().getAttribute("src"));

let fetchResult;
beforeEach(() => {
  vi.stubGlobal("Image", FakeImage);
  fetchResult = new Promise(() => {}); // the direct request: pending unless a test resolves it
  vi.stubGlobal("fetch", () => fetchResult);
  __resetAppLogosForTest();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Logo — no flash", () => {
  it("shows nothing for a cached (possibly stale) logo, then the server-confirmed one", async () => {
    render(<Logo variant="mark" tone="white" />);
    await act(async () => emit(snap({ appLogoUrlOnDark: OLD }, true)));
    await flush();
    expect(visibleSrc()).toBe(null); // the old logo never appears
    await act(async () => emit(snap({ appLogoUrlOnDark: NEW }, false)));
    await flush();
    expect(visibleSrc()).toBe(NEW);
  });

  it("the quick direct request confirms the logo without waiting for the listener", async () => {
    fetchResult = Promise.resolve({ ok: true, status: 200, json: async () => ({ fields: { appLogoUrlOnDark: { stringValue: NEW } } }) });
    render(<Logo variant="mark" tone="white" />);
    await flush();
    await flush();
    expect(visibleSrc()).toBe(NEW);
  });

  it("falls back to the default mark, never a broken image", async () => {
    render(<Logo variant="mark" tone="white" />);
    await act(async () => emit(snap({ appLogoUrlOnDark: BROKEN }, false)));
    await flush();
    await flush();
    expect(visibleSrc()).toBe("/brand/mark-white.png");
  });

});
