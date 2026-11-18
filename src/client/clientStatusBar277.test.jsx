// @vitest-environment jsdom
// #277 (owner): in the coached client app the strip at the top of the
// iPhone (status bar) stayed WHITE when the client switched Appearance to
// dark — only the coach console and Train Solo ever told the phone to go
// dark. The client app now posts its own light/dark to the native strip
// and the browser's theme-color, every time it changes.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";

afterEach(() => {
  cleanup();
  delete window.webkit;
  document.head.innerHTML = "";
});

describe("client status-bar strip follows Appearance (#277)", () => {
  it("dark → the phone's strip and theme-color go black; light → white; leaving restores", async () => {
    const { useClientStatusBar } = await import("./ClientApp");
    const { CLIENT_DARK_BG } = await import("../theme");
    const postMessage = vi.fn();
    window.webkit = { messageHandlers: { apexTheme: { postMessage } } };
    document.head.innerHTML = '<meta name="theme-color" content="#FFFFFF">';
    const meta = document.querySelector('meta[name="theme-color"]');

    const { rerender, unmount } = renderHook(({ dark }) => useClientStatusBar(dark), { initialProps: { dark: true } });
    expect(postMessage).toHaveBeenLastCalledWith({ dark: true, edgeToEdge: false });
    expect(meta.getAttribute("content")).toBe(CLIENT_DARK_BG);

    rerender({ dark: false }); // the client switches to White in Profile
    expect(postMessage).toHaveBeenLastCalledWith({ dark: false, edgeToEdge: false });
    expect(meta.getAttribute("content")).toBe("#FFFFFF");

    rerender({ dark: true }); // and back to Black
    expect(postMessage).toHaveBeenLastCalledWith({ dark: true, edgeToEdge: false });

    unmount();
    expect(meta.getAttribute("content")).toBe("#FFFFFF");
  });
});
