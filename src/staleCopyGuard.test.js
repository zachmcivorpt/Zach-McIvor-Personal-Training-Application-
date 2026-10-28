// @vitest-environment jsdom
//
// Register #105: the iPhone app opens the copy of index.html saved on the
// phone (instant open). If that copy is from an older release and its code
// files are gone, the inline guard in index.html must reload the latest
// version — once, never in a loop.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const html = readFileSync("index.html", "utf8");
const guard = html.match(/<script>\s*(\(function \(\) \{\s*var KEY = "apexStaleCopyReload"[\s\S]*?\}\)\(\);)\s*<\/script>/)[1];

let reload;
beforeEach(() => {
  sessionStorage.clear();
  reload = vi.fn();
  Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload } });
  new Function(guard)();
});

function failAsset(tag, url) {
  const el = document.createElement(tag);
  if (tag === "script") el.src = url;
  else el.href = url;
  document.head.appendChild(el);
  el.dispatchEvent(new Event("error"));
}

describe("stale saved copy guard (index.html)", () => {
  it("a missing main script from /assets/ reloads the page once", () => {
    failAsset("script", "https://example.com/assets/index-OLD.js");
    expect(reload).toHaveBeenCalledTimes(1);
    failAsset("script", "https://example.com/assets/index-OLD.js");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("a missing stylesheet or a lazy screen's code (vite:preloadError) does too", () => {
    failAsset("link", "https://example.com/assets/index-OLD.css");
    expect(reload).toHaveBeenCalledTimes(1);
    sessionStorage.clear();
    const ev = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(ev);
    expect(reload).toHaveBeenCalledTimes(2);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("anything that isn't our code (fonts, images, other sites) is ignored", () => {
    failAsset("link", "https://fonts.googleapis.com/css2?family=Inter");
    failAsset("script", "https://example.com/other.js");
    const img = document.createElement("img");
    img.src = "https://example.com/assets/photo.png";
    document.body.appendChild(img);
    img.dispatchEvent(new Event("error"));
    expect(reload).not.toHaveBeenCalled();
  });
});
