import { describe, expect, it } from "vitest";
import { resolveLoginBackground } from "./LoginBackground";

const CURRENT = "https://firebasestorage.googleapis.com/v0/b/zach-mcivor-pt-app.firebasestorage.app/o/design%2Flogin-bg_1790774514875_IMG_7441.mov?alt=media&token=abc";

describe("resolveLoginBackground", () => {
  it("serves the current login video from the small bundled copy with a poster", () => {
    expect(resolveLoginBackground({ loginBackgroundUrl: CURRENT, loginBackgroundType: "video" })).toEqual({
      type: "video",
      src: "/brand/login-bg-1790774514875.mp4",
      poster: "/brand/login-bg-1790774514875.jpg",
    });
  });
  it("plays any other uploaded video or photo straight from Storage, as before", () => {
    const other = "https://firebasestorage.googleapis.com/v0/b/x/o/design%2Fnew.mp4?alt=media";
    expect(resolveLoginBackground({ loginBackgroundUrl: other, loginBackgroundType: "video" })).toEqual({ type: "video", src: other, poster: null });
    expect(resolveLoginBackground({ loginBackgroundUrl: other, loginBackgroundType: null })).toEqual({ type: "image", src: other, poster: null });
  });
  it("renders nothing when no background is set", () => {
    expect(resolveLoginBackground({ loginBackgroundUrl: null })).toBeNull();
    expect(resolveLoginBackground(undefined)).toBeNull();
  });
});
