// These used to be base64 data URIs inlined directly here — 464KB of raw
// source that every single page had to download and parse as part of the
// main JS bundle before the app could render anything, just to show a
// logo. The same four images already exist as real files under
// public/brand/ (vite.config.js's PWA plugin already precaches them), so
// pointing at those instead gets the exact same pixels with none of that
// cost: the browser's own image decoder fetches/decodes/caches them
// off the JS critical path, the same way any other <img> works.
export const LOGO_BLACK = "/brand/logo-black.png";
export const LOGO_WHITE = "/brand/logo-white.png";
export const MARK_BLACK = "/brand/mark-black.png";
export const MARK_WHITE = "/brand/mark-white.png";
