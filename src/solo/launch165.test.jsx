// @vitest-environment jsdom
//
// #165: opening Train Solo showed white → an empty frame → white → a plain
// BLACK screen → the app, took ~2.2 s on a phone-speed connection, and
// stayed blank for as long as Google's font server took to answer. These
// pin each cause.
import React, { Suspense } from "react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

afterEach(() => {
  cleanup();
  vi.resetModules();
  vi.doUnmock("../lib/AppContext");
  vi.doUnmock("./SoloRoutes");
  vi.doUnmock("../lib/SoloAppContext");
});
beforeEach(() => localStorage.clear());

describe("Train Solo's loading screen", () => {
  it("is the member's own colour with the APEX mark — never plain black in light mode", async () => {
    const { default: SoloLaunchScreen } = await import("./SoloLaunchScreen");
    localStorage.setItem("soloThemeDark", "false");
    const { unmount } = render(<SoloLaunchScreen />);
    const light = screen.getByTestId("solo-launch-screen");
    expect(light.style.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(light.querySelector("img")).toBeTruthy();
    expect(light.hasAttribute("data-apex-loading")).toBe(true);
    unmount();
    render(<SoloLaunchScreen dark />);
    expect(screen.getByTestId("solo-launch-screen").style.backgroundColor).toBe("rgb(10, 10, 11)");
  });

  it("is what SoloRoutes shows while sign-in restores (was a black div)", async () => {
    localStorage.setItem("soloThemeDark", "false");
    vi.doMock("../lib/SoloAppContext", () => ({
      SoloAppProvider: ({ children }) => children,
      useSoloApp: () => ({ soloSessionLoading: true, soloBranding: {}, refreshSoloEntitlement: () => Promise.resolve({}), soloTier: "free" }),
    }));
    const { default: SoloRoutes } = await import("./SoloRoutes");
    render(
      <MemoryRouter initialEntries={["/solo/home"]}>
        <Routes>
          <Route path="/solo/*" element={<SoloRoutes />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId("solo-launch-screen").style.backgroundColor).toBe("rgb(255, 255, 255)");
  });
});

describe("opening the app on a Train Solo member's phone", () => {
  function Where() {
    return <p data-testid="where">{useLocation().pathname}</p>;
  }
  async function renderRootWhileCoachingLoads() {
    vi.doMock("../lib/AppContext", () => ({
      AppProvider: ({ children }) => children,
      useApp: () => ({ sessionLoading: true, currentUser: null }),
      PROFILE_CACHE_KEY: "apexProfileCache",
    }));
    vi.doMock("./SoloRoutes", () => ({ default: () => <p>solo-routes</p> }));
    const { Routed } = await import("../App");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routed />
        <Where />
      </MemoryRouter>
    );
  }

  it("goes straight to Train Solo without waiting for Coaching's sign-in check", async () => {
    localStorage.setItem("apexSoloSignedIn", "1");
    await renderRootWhileCoachingLoads();
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/solo/home"));
    await screen.findByText("solo-routes");
  });

  it("someone who also uses Coaching on this phone keeps the old order (waits)", async () => {
    localStorage.setItem("apexSoloSignedIn", "1");
    localStorage.setItem("apexProfileCache", JSON.stringify({ role: "client" }));
    await renderRootWhileCoachingLoads();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("where").textContent).toBe("/");
  });
});

describe("Train Solo's sign-in restore", () => {
  it("has no popup/redirect helper (it loaded Google's iframe and waited on it every launch); Coaching's is unchanged", async () => {
    const calls = { getAuth: [], initializeAuth: [] };
    vi.doMock("firebase/app", () => ({ initializeApp: (_c, name) => ({ name: name || "[DEFAULT]" }) }));
    vi.doMock("firebase/auth", () => ({
      getAuth: (app) => (calls.getAuth.push(app.name), {}),
      initializeAuth: (app, opts) => (calls.initializeAuth.push([app.name, opts]), {}),
      indexedDBLocalPersistence: "idb",
      browserLocalPersistence: "local",
      browserSessionPersistence: "session",
    }));
    vi.doMock("firebase/firestore", () => ({ initializeFirestore: () => ({}), getFirestore: () => ({}), persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}) }));
    vi.doMock("firebase/storage", () => ({ getStorage: () => ({}) }));
    vi.doMock("firebase/functions", () => ({ getFunctions: () => ({}) }));
    await import("../lib/firebase");
    expect(calls.getAuth).toEqual(["[DEFAULT]"]);
    expect(calls.initializeAuth).toEqual([["solo", { persistence: ["idb", "local", "session"] }]]);
    for (const m of ["firebase/app", "firebase/auth", "firebase/firestore", "firebase/storage", "firebase/functions"]) vi.doUnmock(m);
  });
});

describe("what Train Solo downloads to open", () => {
  // Static imports only (import() loads later, off the launch path).
  function staticGraph(entry) {
    const seen = new Set();
    const walk = (file) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(file, "utf8");
      for (const [, spec] of src.matchAll(/^\s*import\s[^;]*?from\s+"(\.[^"]+)"/gms)) {
        const base = resolve(dirname(file), spec);
        const hit = [base, `${base}.jsx`, `${base}.js`].find((f) => {
          try {
            return readFileSync(f) && !f.endsWith("/");
          } catch {
            return false;
          }
        });
        if (hit) walk(hit);
      }
    };
    walk(resolve(entry));
    return seen;
  }

  it("never includes the coached client app (its code and food database, ~0.7 MB)", () => {
    const graph = [...staticGraph("src/solo/SoloRoutes.jsx")];
    expect(graph.some((f) => f.endsWith("src/solo/SoloShell.jsx"))).toBe(true);
    expect(graph.filter((f) => f.endsWith("src/client/ClientApp.jsx") || f.endsWith("src/lib/foodDatabase.js"))).toEqual([]);
  });

  it("a screen fetched ahead of time shows at once — no loading frame", async () => {
    const { lazyScreen } = await import("./soloScreens");
    const Screen = lazyScreen(() => Promise.resolve({ default: () => <p>the screen</p> }));
    await Screen.preload();
    render(
      <Suspense fallback={<p>loading</p>}>
        <Screen />
      </Suspense>
    );
    expect(screen.getByText("the screen")).toBeTruthy();
    expect(screen.queryByText("loading")).toBe(null);
  });
});

describe("the page under Train Solo", () => {
  it("is the member's colour (was white under dark mode on every bounce), and back to normal on leaving", async () => {
    vi.doMock("../lib/SoloAppContext", () => ({ useSoloApp: () => ({ soloBranding: {}, soloProfileMissing: false }) }));
    const { SoloThemeProvider } = await import("./SoloThemeContext");
    localStorage.setItem("soloThemeDark", "true");
    const { unmount } = render(
      <MemoryRouter initialEntries={["/solo/home"]}>
        <SoloThemeProvider>
          <p>x</p>
        </SoloThemeProvider>
      </MemoryRouter>
    );
    expect(document.body.style.backgroundColor).toBe("rgb(10, 10, 11)");
    unmount();
    expect(document.body.style.backgroundColor).toBe("");
  });
});

describe("index.html", () => {
  it("doesn't make the first paint wait for Google's font stylesheet", () => {
    const html = readFileSync("index.html", "utf8").replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
    const blocking = [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]).filter((tag) => /fonts\.googleapis\.com\/css/.test(tag) && /rel="stylesheet"/.test(tag));
    expect(blocking).toEqual([]);
    expect(html).toMatch(/rel="preload"[\s\S]*?as="style"[\s\S]*?fonts\.googleapis\.com\/css2\?family=Inter[\s\S]*?this\.rel='stylesheet'/);
  });
});
